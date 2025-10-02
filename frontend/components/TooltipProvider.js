"use client";
import { Tooltip } from "react-tooltip";

export const TooltipProvider = ({ message, tooltipId, place, style, children }) => {
    return (
        <div style={style}>
            {/* Tooltip instance */}
            <Tooltip
                id={tooltipId}
                place={place}
                isOpen={!!message}
                className="tooltip-custom"
            />

            {/*Tooltip Wrapper*/}
            <div data-tooltip-id={tooltipId}
              data-tooltip-content={message || ""}
              style={style}
              >
              {children}
            </div>
        </div>
    );
};