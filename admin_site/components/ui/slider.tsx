"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    style={{ height: "20px" }}
    {...props}
  >
    <SliderPrimitive.Track
      className="relative w-full grow overflow-hidden rounded-full"
      style={{ height: "8px", backgroundColor: "#52525b" }}
    >
      <SliderPrimitive.Range
        className="absolute h-full"
        style={{ backgroundColor: "#ffffff" }}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      style={{
        height: "20px",
        width: "20px",
        backgroundColor: "#ffffff",
        border: "2px solid #ffffff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        cursor: "grab"
      }}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
