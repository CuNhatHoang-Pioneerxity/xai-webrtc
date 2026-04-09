/**
 * TopBar component - Header with title, connection status, and provider info
 */

import React from "react";

interface TopBarProps {
  isConnected: boolean;
  isConnecting?: boolean;
  provider: string | null;
  connectionQuality?: "excellent" | "good" | "fair" | "poor" | "unknown";
}

export const TopBar: React.FC<TopBarProps> = ({ isConnected, isConnecting = false, provider, connectionQuality = "unknown" }) => {
  const getQualityColor = () => {
    switch (connectionQuality) {
      case "excellent":
        return "#28a745";
      case "good":
        return "#5cb85c";
      case "fair":
        return "#ffc107";
      case "poor":
        return "#dc3545";
      default:
        return "#6c757d";
    }
  };
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        color: "#37474f",
        border: "1px solid #dee2e6",
        borderRadius: "8px",
        padding: "1rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>
        Pioneerxity Omni
      </h1>
      
      <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
        {provider && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.9rem" }}>Protocol:</span>
            <span style={{ fontWeight: "bold", color: "#17a2b8" }}>{provider}</span>
          </div>
        )}
        
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: isConnected ? getQualityColor() : isConnecting ? "#ffc107" : "#dc3545",
            }}
          />
          <span style={{ fontSize: "0.9rem" }}>
            {isConnected ? `Connected (${connectionQuality})` : isConnecting ? "Connecting..." : "Disconnected"}
          </span>
        </div>
      </div>
    </div>
  );
};

