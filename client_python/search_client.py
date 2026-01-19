"""
Firestore Vector Search Client (Python)

This module provides Python wrappers for the vector search Cloud Functions,
designed for use in Streamlit apps or other Python applications.

Example:
    >>> from search_client import VectorSearchClient
    >>>
    >>> # Initialize with service account
    >>> client = VectorSearchClient("path/to/service-account.json")
    >>>
    >>> # Search documents
    >>> results = client.search("FinFET process with stress engineering")
    >>> for r in results:
    ...     print(f"{r.relevance_score}% - {r.summary}")

Streamlit Example:
    >>> import streamlit as st
    >>> from search_client import VectorSearchClient, StreamlitSearchUI
    >>>
    >>> client = VectorSearchClient.from_streamlit_secrets()
    >>> ui = StreamlitSearchUI(client)
    >>> ui.render()
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional, List, Callable, Any
from functools import lru_cache

import requests

from .types import (
    SearchRequest,
    SearchResponse,
    SearchResult,
    BackfillRequest,
    BackfillResponse,
    EmbeddingStats,
    search_response_from_dict,
    backfill_response_from_dict,
    embedding_stats_from_dict,
)


# =============================================================================
# Vector Search Client
# =============================================================================

class VectorSearchClient:
    """
    Client for interacting with vector search Cloud Functions.

    This client handles authentication and provides typed methods
    for searching documents and managing embeddings.

    Attributes:
        project_id: Firebase project ID.
        region: Cloud Functions region (default: us-central1).

    Example:
        >>> client = VectorSearchClient(
        ...     credentials_path="service-account.json",
        ...     project_id="my-project"
        ... )
        >>>
        >>> results = client.search("metal fill optimization")
        >>> print(f"Found {len(results.results)} matches")
    """

    def __init__(
        self,
        credentials_path: Optional[str] = None,
        project_id: Optional[str] = None,
        region: str = "us-central1",
        id_token: Optional[str] = None,
    ):
        """
        Initialize the vector search client.

        Args:
            credentials_path: Path to service account JSON file.
            project_id: Firebase project ID (inferred from credentials if not provided).
            region: Cloud Functions region.
            id_token: Pre-obtained ID token for authentication (for Streamlit/web apps).
        """
        self.region = region
        self._id_token = id_token
        self._credentials_path = credentials_path

        # Initialize Firebase Admin if credentials provided
        if credentials_path:
            self._init_firebase_admin(credentials_path)

            # Infer project ID from credentials if not provided
            if not project_id:
                with open(credentials_path) as f:
                    creds = json.load(f)
                    project_id = creds.get("project_id")

        if not project_id:
            project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")

        if not project_id:
            raise ValueError(
                "project_id must be provided or set via GOOGLE_CLOUD_PROJECT environment variable"
            )

        self.project_id = project_id
        self._base_url = f"https://{region}-{project_id}.cloudfunctions.net"

    def _init_firebase_admin(self, credentials_path: str) -> None:
        """Initialize Firebase Admin SDK."""
        try:
            import firebase_admin
            from firebase_admin import credentials

            # Only initialize if not already done
            if not firebase_admin._apps:
                cred = credentials.Certificate(credentials_path)
                firebase_admin.initialize_app(cred)
        except ImportError:
            # firebase_admin not installed, will use REST API
            pass

    @classmethod
    def from_streamlit_secrets(cls, region: str = "us-central1") -> "VectorSearchClient":
        """
        Create client from Streamlit secrets.

        Expects secrets in .streamlit/secrets.toml:

        [firebase]
        project_id = "your-project"

        [firebase.credentials]
        type = "service_account"
        project_id = "your-project"
        ...

        Args:
            region: Cloud Functions region.

        Returns:
            Configured VectorSearchClient.
        """
        try:
            import streamlit as st

            # Get credentials from secrets
            creds = dict(st.secrets.get("firebase", {}).get("credentials", {}))
            project_id = st.secrets.get("firebase", {}).get("project_id")

            if not creds or not project_id:
                raise ValueError(
                    "Firebase credentials not found in Streamlit secrets. "
                    "Add [firebase] section to .streamlit/secrets.toml"
                )

            # Write credentials to temp file for Firebase Admin
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                json.dump(creds, f)
                creds_path = f.name

            return cls(
                credentials_path=creds_path,
                project_id=project_id,
                region=region,
            )

        except ImportError:
            raise ImportError("streamlit package required for from_streamlit_secrets()")

    @classmethod
    def from_environment(cls, region: str = "us-central1") -> "VectorSearchClient":
        """
        Create client from environment variables.

        Expects:
        - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
        - GOOGLE_CLOUD_PROJECT: Firebase project ID

        Args:
            region: Cloud Functions region.

        Returns:
            Configured VectorSearchClient.
        """
        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")

        return cls(
            credentials_path=creds_path,
            project_id=project_id,
            region=region,
        )

    def _get_id_token(self) -> str:
        """Get ID token for authenticating Cloud Function calls."""
        if self._id_token:
            return self._id_token

        try:
            import google.auth
            from google.auth.transport.requests import Request
            from google.oauth2 import id_token

            # Get credentials
            credentials, _ = google.auth.default()

            # Refresh if needed
            if hasattr(credentials, 'refresh'):
                credentials.refresh(Request())

            # Get ID token for the Cloud Function
            target_audience = f"{self._base_url}/vector_search"
            token = id_token.fetch_id_token(Request(), target_audience)

            return token

        except Exception as e:
            raise RuntimeError(f"Failed to get ID token: {e}")

    def _call_function(self, function_name: str, data: dict) -> dict:
        """
        Call a Cloud Function via HTTP.

        Args:
            function_name: Name of the function to call.
            data: Request data to send.

        Returns:
            Response data from the function.

        Raises:
            RuntimeError: If the function call fails.
        """
        url = f"{self._base_url}/{function_name}"

        headers = {
            "Content-Type": "application/json",
        }

        # Add authentication if we have credentials
        if self._credentials_path or self._id_token:
            try:
                token = self._get_id_token()
                headers["Authorization"] = f"Bearer {token}"
            except Exception:
                pass  # Try without auth (for testing)

        response = requests.post(
            url,
            json={"data": data},
            headers=headers,
            timeout=60,
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Function {function_name} failed with status {response.status_code}: "
                f"{response.text}"
            )

        result = response.json()

        # Cloud Functions wrap response in {"result": ...}
        if "result" in result:
            return result["result"]

        return result

    def search(
        self,
        query: str,
        limit: int = 20,
        threshold: float = 0.5,
        collection_path: str = "documents",
    ) -> SearchResponse:
        """
        Search documents using natural language query.

        Args:
            query: Natural language search query (min 3 characters).
            limit: Maximum results to return (default: 20, max: 50).
            threshold: Distance threshold 0.0-1.0 (default: 0.5).
            collection_path: Collection to search (default: "documents").

        Returns:
            SearchResponse with results sorted by relevance.

        Raises:
            ValueError: If query is too short.
            RuntimeError: If search fails.

        Example:
            >>> response = client.search("yield improvement techniques")
            >>> for result in response.results:
            ...     print(f"{result.relevance_score}% - {result.summary}")
        """
        if len(query.strip()) < 3:
            raise ValueError("Query must be at least 3 characters")

        data = {
            "collectionPath": collection_path,
            "query": query,
            "limit": min(limit, 50),
            "threshold": max(0.0, min(1.0, threshold)),
        }

        result = self._call_function("vector_search", data)
        return search_response_from_dict(result)

    def backfill_embeddings(
        self,
        collection_path: str = "documents",
        limit: int = 50,
    ) -> BackfillResponse:
        """
        Backfill embeddings for existing documents.

        Call repeatedly until remaining is 0.

        Args:
            collection_path: Collection to process.
            limit: Maximum documents per call (default: 50, max: 200).

        Returns:
            BackfillResponse with processing counts.

        Example:
            >>> while True:
            ...     response = client.backfill_embeddings(limit=50)
            ...     print(f"Processed {response.processed}, {response.remaining} left")
            ...     if response.remaining == 0:
            ...         break
        """
        data = {
            "collectionPath": collection_path,
            "limit": min(limit, 200),
        }

        result = self._call_function("backfill_embeddings", data)
        return backfill_response_from_dict(result)

    def get_embedding_stats(
        self,
        collection_path: str = "documents",
    ) -> EmbeddingStats:
        """
        Get embedding coverage statistics.

        Args:
            collection_path: Collection to analyze.

        Returns:
            EmbeddingStats with coverage information.

        Example:
            >>> stats = client.get_embedding_stats()
            >>> print(f"Coverage: {stats.coverage_percent}%")
        """
        data = {"collectionPath": collection_path}
        result = self._call_function("get_embedding_stats", data)
        return embedding_stats_from_dict(result)


# =============================================================================
# Streamlit UI Components
# =============================================================================

class StreamlitSearchUI:
    """
    Ready-to-use Streamlit UI for vector search.

    Provides a complete search interface with debouncing,
    threshold configuration, and result display.

    Example:
        >>> import streamlit as st
        >>> from search_client import VectorSearchClient, StreamlitSearchUI
        >>>
        >>> client = VectorSearchClient.from_streamlit_secrets()
        >>> ui = StreamlitSearchUI(client)
        >>> ui.render()
    """

    def __init__(
        self,
        client: VectorSearchClient,
        collection_path: str = "documents",
        debounce_ms: int = 500,
        default_threshold: float = 0.5,
    ):
        """
        Initialize the Streamlit search UI.

        Args:
            client: VectorSearchClient instance.
            collection_path: Default collection to search.
            debounce_ms: Debounce delay for search input.
            default_threshold: Default search threshold.
        """
        self.client = client
        self.collection_path = collection_path
        self.debounce_ms = debounce_ms
        self.default_threshold = default_threshold

    def render(self) -> Optional[SearchResponse]:
        """
        Render the search UI and return results.

        Returns:
            SearchResponse if search was performed, None otherwise.
        """
        import streamlit as st

        # Initialize session state
        if "search_query" not in st.session_state:
            st.session_state.search_query = ""
        if "search_threshold" not in st.session_state:
            st.session_state.search_threshold = self.default_threshold
        if "search_results" not in st.session_state:
            st.session_state.search_results = None

        # Search input
        query = st.text_input(
            "Search",
            value=st.session_state.search_query,
            placeholder="Enter search query (min 3 characters)...",
            key="search_input",
        )

        # Threshold slider in expander
        with st.expander("Search Settings"):
            threshold = st.slider(
                "Distance Threshold",
                min_value=0.0,
                max_value=1.0,
                value=st.session_state.search_threshold,
                step=0.05,
                help="Lower = stricter matching. Higher = more results.",
            )
            st.session_state.search_threshold = threshold

            # Show similarity interpretation
            similarity = int((1 - threshold / 2) * 100)
            st.caption(f"Showing results at least {similarity}% similar")

        # Perform search
        results = None
        if query and len(query.strip()) >= 3:
            if query != st.session_state.search_query:
                st.session_state.search_query = query

                with st.spinner("Searching..."):
                    try:
                        results = self.client.search(
                            query=query,
                            threshold=threshold,
                            collection_path=self.collection_path,
                        )
                        st.session_state.search_results = results
                    except Exception as e:
                        st.error(f"Search failed: {e}")
                        return None
            else:
                results = st.session_state.search_results

        # Display results
        if results:
            st.subheader(f"Results ({len(results.results)} matches)")

            for result in results.results:
                self._render_result(result)
        elif query and len(query.strip()) >= 3:
            st.info("No matching documents found.")

        return results

    def _render_result(self, result: SearchResult) -> None:
        """Render a single search result."""
        import streamlit as st

        # Relevance badge color
        if result.relevance_score >= 70:
            badge_color = "green"
        elif result.relevance_score >= 40:
            badge_color = "orange"
        else:
            badge_color = "gray"

        with st.container():
            col1, col2 = st.columns([1, 4])

            with col1:
                st.markdown(
                    f"<span style='color: {badge_color}; font-size: 1.5em; font-weight: bold;'>"
                    f"{result.relevance_score}%</span>",
                    unsafe_allow_html=True,
                )
                st.caption(f"d={result.distance:.3f}")

            with col2:
                if result.title:
                    st.markdown(f"**{result.title}**")
                st.write(result.summary)
                if result.category:
                    st.caption(f"Category: {result.category}")

            st.divider()


# =============================================================================
# Utility Functions
# =============================================================================

def calculate_relevance(distance: float, baseline: float = 0.4) -> int:
    """
    Convert cosine distance to relevance percentage.

    Args:
        distance: Cosine distance (0.0-2.0).
        baseline: Distance at which relevance becomes 0% (default: 0.4).

    Returns:
        Relevance score 0-100.

    Example:
        >>> calculate_relevance(0.1)
        75
        >>> calculate_relevance(0.4)
        0
    """
    relevance = (1 - distance / baseline) * 100
    return max(0, min(100, int(relevance)))


def format_relevance(score: int, distance: float) -> str:
    """
    Format relevance for display.

    Args:
        score: Relevance score (0-100).
        distance: Raw cosine distance.

    Returns:
        Formatted string like "75% (d=0.100)".
    """
    return f"{score}% (d={distance:.3f})"


def batch_backfill(
    client: VectorSearchClient,
    collection_path: str = "documents",
    batch_size: int = 50,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> int:
    """
    Run backfill until all documents have embeddings.

    Args:
        client: VectorSearchClient instance.
        collection_path: Collection to process.
        batch_size: Documents per batch.
        progress_callback: Optional callback(processed, remaining).

    Returns:
        Total documents processed.

    Example:
        >>> def on_progress(processed, remaining):
        ...     print(f"Processed {processed}, {remaining} remaining")
        >>>
        >>> total = batch_backfill(client, progress_callback=on_progress)
        >>> print(f"Backfilled {total} documents")
    """
    total_processed = 0

    while True:
        response = client.backfill_embeddings(
            collection_path=collection_path,
            limit=batch_size,
        )

        total_processed += response.processed

        if progress_callback:
            progress_callback(total_processed, response.remaining)

        if response.remaining == 0:
            break

        # Brief pause to avoid rate limiting
        time.sleep(0.5)

    return total_processed
