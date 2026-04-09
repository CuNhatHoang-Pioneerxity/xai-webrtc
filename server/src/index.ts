/**
 * XAI Voice WebRTC Server
 *
 * WebRTC-to-WebSocket relay server for XAI's realtime voice API.
 * Handles signaling, peer connections, and audio/message relay.
 */

import "dotenv/config";
import express from "express";
import ExpressWs from "express-ws";
import type WebSocket from "ws";
import { SessionManager } from "./session-manager";
import { RTCPeerManager } from "./rtc-peer";
import type { SignalingMessage } from "./types";

// Helper to get timestamp with milliseconds
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().split('T')[1].replace('Z', '');
};

// Override console.log to include timestamps
const originalLog = console.log;
console.log = (...args: any[]) => {
  originalLog(`[${getTimestamp()}]`, ...args);
};

const { app } = ExpressWs(express());

// CORS Configuration - Configure for your specific domain in production
// For development, you can use specific localhost ports
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,http://localhost:8080").split(",");

// Enable CORS for web clients - restricted to specific origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

// Configuration
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const API_URL = process.env.API_URL || "wss://api.x.ai/v1/realtime";
const PORT = 8000;
const INSTRUCTIONS = process.env.INSTRUCTIONS || "Bạn là **nhân viên phục vụ nhà hàng qua điện thoại** (phone waiter) nói **tiếng Việt tự nhiên, lịch sự, rõ ràng**.\n" +
    "Nhiệm vụ của bạn là nhận cuộc gọi, tư vấn menu, xác nhận món, đọc lại đơn hàng và thông báo giá tiền cho khách.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## 🎯 Vai trò chính\n" +
    "\n" +
    "* Chào khách và hỗ trợ đặt món qua điện thoại.\n" +
    "* Giải thích món ăn ngắn gọn, dễ hiểu.\n" +
    "* Gợi ý món nếu khách chưa quyết định.\n" +
    "* Xác nhận lại đơn hàng trước khi kết thúc.\n" +
    "* Luôn nói chuyện thân thiện, chuyên nghiệp như nhân viên nhà hàng thật.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## 🗣️ Quy tắc ngôn ngữ\n" +
    "\n" +
    "* Luôn sử dụng **tiếng Việt chuẩn**, xưng hô lịch sự: *dạ, anh/chị, em xin phép*.\n" +
    "* Câu nói ngắn, rõ, dễ nghe qua điện thoại.\n" +
    "* Không dùng emoji.\n" +
    "* Không dùng markdown, ký hiệu kỹ thuật, hay giải thích nội bộ.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## 💰 QUY TẮC ĐỌC TIỀN VIỆT NAM (RẤT QUAN TRỌNG)\n" +
    "\n" +
    "AI PHẢI LUÔN đọc giá tiền thành **chữ tiếng Việt đầy đủ**, KHÔNG đọc ký hiệu tiền tệ.\n" +
    "\n" +
    "### ❌ KHÔNG BAO GIỜ đọc:\n" +
    "\n" +
    "* “đồng ký hiệu”\n" +
    "* “VNĐ”\n" +
    "* “vê en đê”\n" +
    "* “đê”\n" +
    "* “₫”\n" +
    "* đọc từng chữ số rời rạc\n" +
    "\n" +
    "### ✅ LUÔN chuyển sang cách đọc tự nhiên:\n" +
    "\n" +
    "| Hiển thị    | Phải đọc thành                         |\n" +
    "| ----------- | -------------------------------------- |\n" +
    "| 369,000₫    | ba trăm sáu mươi chín nghìn đồng       |\n" +
    "| 1,106,000₫  | một triệu một trăm linh sáu nghìn đồng |\n" +
    "| 421,000 VNĐ | bốn trăm hai mươi mốt nghìn đồng       |\n" +
    "| ₫211,000    | hai trăm mười một nghìn đồng           |\n" +
    "\n" +
    "### Quy tắc chuyển đổi:\n" +
    "\n" +
    "1. Bỏ toàn bộ ký hiệu tiền (`₫`, `VNĐ`, `VND`).\n" +
    "2. Chuyển số thành chữ tiếng Việt tự nhiên.\n" +
    "3. Luôn kết thúc bằng từ **“đồng”**.\n" +
    "4. Dùng:\n" +
    "\n" +
    "   * *linh* (ví dụ: một trăm linh sáu)\n" +
    "   * *mươi*, *nghìn*, *triệu* đúng chuẩn tiếng Việt.\n" +
    "5. Không đọc dấu phẩy hoặc dấu chấm.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## 📋 Quy trình cuộc gọi\n" +
    "\n" +
    "1. Chào khách.\n" +
    "2. Hỏi nhu cầu đặt món hoặc tư vấn.\n" +
    "3. Giới thiệu món khi cần.\n" +
    "4. Xác nhận từng món + số lượng.\n" +
    "5. Đọc lại **tổng tiền bằng chữ**.\n" +
    "6. Hỏi xác nhận cuối cùng.\n" +
    "7. Cảm ơn và kết thúc lịch sự.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## ✅ Ví dụ chuẩn\n" +
    "\n" +
    "Khách: “Cho tôi món cá hồi giá bao nhiêu?”\n" +
    "Bạn:\n" +
    "“Dạ, món cá hồi miso có giá **tám trăm chín mươi sáu nghìn đồng** ạ.”\n" +
    "\n" +
    "---\n" +
    "\n" +
    "Khách: “Tổng bao nhiêu tiền?”\n" +
    "Bạn:\n" +
    "“Dạ tổng đơn của anh/chị là **một triệu ba trăm linh năm nghìn đồng** ạ.”\n" +
    "\n" +
    "---\n" +
    "\n" +
    "## 🚫 Điều cấm\n" +
    "\n" +
    "* Không tự ý thay đổi giá.\n" +
    "* Không đọc ký hiệu tiền tệ.\n" +
    "* Không nói tiếng Anh trừ khi khách yêu cầu.\n" +
    "* Không giải thích bạn là AI.\n" +
    "\n" +
    "---\n" +
    "\n" +
    "Bạn luôn hành xử như một **nhân viên phục vụ nhà hàng chuyên nghiệp đang nói chuyện qua điện thoại thật**.\n" +
    "## Thực Đơn\n" +
    "\n" +
    "### 🥗 Món Khai Vị & Ăn Nhẹ\n" +
    "| Món | Mô tả | Giá |\n" +
    "| :--- | :--- | :--- |\n" +
    "| **Arancini Nấm Truffle** | Viên cơm risotto chiên giòn, nhân phô mai mozzarella tan chảy, dùng kèm sốt aioli truffle. | 369,000₫ |\n" +
    "| **Bạch Tuộc Nướng Cháy Cạnh** | Bạch tuộc nướng với dầu paprika hun khói, khoai tây baby và vỏ chanh bào. | 474,000₫ |\n" +
    "| **Salad Rau Vườn** | Cải kale non địa phương, củ cải bào lát mỏng và sốt giấm balsamic trắng mật ong. | 316,000₫ |\n" +
    "\n" +
    "### 🥩 Món Chính\n" +
    "| Món | Mô tả | Giá |\n" +
    "| :--- | :--- | :--- |\n" +
    "| **Bò Ribeye Đặc Trưng** | Thịt bò ăn cỏ 340g, bơ hương thảo và khoai nghiền tỏi. | 1,106,000₫ |\n" +
    "| **Cá Hồi Sốt Miso** | Cá hồi áp chảo ăn kèm cải thìa và cơm jasmine gừng thơm. | 896,000₫ |\n" +
    "| **Risotto Nấm Rừng** | Cơm Ý Arborio nấu cùng nấm porcini và phô mai Parmesan ủ 24 tháng. | 738,000₫ |\n" +
    "\n" +
    "### 🍹 Cocktail & Thức Uống Đặc Trưng\n" +
    "* **Copper Mule** — Vodka, nước cốt chanh tươi, bia gừng nhà làm và vài giọt bitters (395,000₫).\n" +
    "* **Midnight Espresso** — Espresso đôi, siro vanilla và vodka cao cấp (421,000₫).\n" +
    "* **Soda Yuzu Sủi Bọt** (Không cồn) — Vị chua thanh mát, giải khát nhẹ nhàng (211,000₫).\n" +
    "\n" +
    "---"
const VOICE = process.env.VOICE || "ara";

// Initialize session manager
const sessionManager = new SessionManager();

// Store active peer connections
const peerConnections = new Map<string, RTCPeerManager>();

// ========================================
// REST API Endpoints
// ========================================

app.get("/", (req, res) => {
  res.json({
    service: "XAI Voice WebRTC Server",
    provider: "XAI",
    protocol: "WebRTC",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      sessions: "/sessions",
      signaling: "/signaling/{session_id}",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    provider: "XAI",
    protocol: "WebRTC",
    timestamp: new Date().toISOString(),
    sessions_active: sessionManager.getSessionCount(),
    peer_connections_active: peerConnections.size,
  });
});

/**
 * Get ephemeral token for direct XAI API connection
 * POST /session
 */
app.post("/session", async (req, res) => {
  try {
    console.log("📝 Creating ephemeral session...");

    const SESSION_REQUEST_URL = "https://api.x.ai/v1/realtime/client_secrets";
    const response = await fetch(SESSION_REQUEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { seconds: 300 }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to get ephemeral token: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        error: "Failed to create session",
        details: errorText
      });
    }

    const data = await response.json() as Record<string, unknown>;
    console.log("✅ Ephemeral session created");

    // Return token along with configuration for frontend
    res.json({
      ...data,
      voice: VOICE,
      instructions: INSTRUCTIONS,
    });
  } catch (error) {
    console.error("❌ Error creating session:", error);
    res.status(500).json({
      error: "Failed to create session",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/sessions", (req, res) => {
  // Get sample rate from request body
  const requestedSampleRate = req.body.sample_rate || 24000;

  // Validate and find closest supported sample rate
  const SUPPORTED_SAMPLE_RATES = [8000, 16000, 21050, 24000, 32000, 44100, 48000];
  let sampleRate = 24000; // default
  if (SUPPORTED_SAMPLE_RATES.includes(requestedSampleRate)) {
    sampleRate = requestedSampleRate;
  } else {
    // Find closest supported sample rate
    sampleRate = SUPPORTED_SAMPLE_RATES.reduce((prev, curr) =>
        Math.abs(curr - requestedSampleRate) < Math.abs(prev - requestedSampleRate) ? curr : prev
    );
    console.log(`Sample rate ${requestedSampleRate}Hz not supported, using ${sampleRate}Hz`);
  }

  const session = sessionManager.createSession(sampleRate);
  res.json({
    session_id: session.id,
    signaling_url: `/signaling/${session.id}`,
    created_at: session.created_at,
    sample_rate: session.sample_rate,
  });
});

app.get("/sessions", (req, res) => {
  const sessions = sessionManager.getAllSessions();
  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      created_at: s.created_at,
      status: s.status,
      webrtc_stats: s.webrtcStats,
    })),
    count: sessions.length,
  });
});

app.delete("/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Clean up peer connection
  const peer = peerConnections.get(sessionId);
  if (peer) {
    peer.close();
    peerConnections.delete(sessionId);
  }

  sessionManager.deleteSession(sessionId);

  res.json({
    message: "Session deleted",
    session_id: sessionId,
  });
});

app.get("/sessions/:sessionId/stats", async (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const peer = peerConnections.get(sessionId);
  if (!peer) {
    return res.status(404).json({ error: "Peer connection not found" });
  }

  const stats = await peer.getStats();
  sessionManager.updateSessionStats(sessionId, stats);

  res.json({
    session_id: sessionId,
    stats,
  });
});

// ========================================
// WebSocket Signaling Endpoint
// ========================================

app.ws("/signaling/:sessionId", async (ws: WebSocket, req) => {
  const sessionId = req.params.sessionId;
  console.log(`[${sessionId}] 🔌 Client connected for signaling`);

  // Verify session exists (must be created via POST /sessions first)
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    ws.close(1002, 'Session not found. Create session first via POST /sessions');
    console.log(`[${sessionId}] ❌ Session not found - signaling connection rejected`);
    return;
  }

  console.log(`[${sessionId}] 🎵 Using session with sample rate: ${session.sample_rate}Hz`);
  sessionManager.updateSessionStatus(sessionId, "active");

  // Create RTCPeerManager with session's sample rate
  const peerManager = new RTCPeerManager({
    sessionId,
    xaiApiKey: XAI_API_KEY,
    xaiApiUrl: API_URL,
    voice: VOICE,
    instructions: INSTRUCTIONS,
    sampleRate: session.sample_rate,
  });

  peerConnections.set(sessionId, peerManager);

  // Initialize XAI connection in parallel (don't block offer creation)
  const xaiInitPromise = peerManager.initializeXAI()
    .then(() => {
      console.log(`[${sessionId}] ✅ XAI API initialized`);
    })
    .catch((error) => {
      console.error(`[${sessionId}] ❌ Failed to initialize XAI API:`, error);
      ws.close(1011, "Failed to connect to XAI API");
    });

  // Set up signaling message handler FIRST (before sending offer)
  // This prevents race condition where answer arrives before we're listening
  ws.on("message", async (data: WebSocket.Data) => {
    try {
      const message: SignalingMessage = JSON.parse(data.toString());

      switch (message.type) {
        case "answer":
          console.log(`[${sessionId}] 📥 Answer received from client`);
          await peerManager.handleAnswer({
            type: "answer",
            sdp: message.sdp,
          });

          // Send ready message
          const readyMessage: SignalingMessage = { type: "ready" };
          ws.send(JSON.stringify(readyMessage));
          console.log(`[${sessionId}] ✅ WebRTC connection established`);
          break;

        case "ice-candidate":
          if (message.candidate) {
            await peerManager.handleIceCandidate(message.candidate);
          }
          break;

        default:
          console.log(`[${sessionId}] ⚠️  Unknown signaling message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[${sessionId}] ❌ Error processing signaling message:`, error);
    }
  });

  // Handle client disconnect
  ws.on("close", () => {
    console.log(`[${sessionId}] Client disconnected`);

    // Clean up peer connection
    peerManager.close();
    peerConnections.delete(sessionId);

    // Update session status
    sessionManager.updateSessionStatus(sessionId, "closed");

    console.log(`[${sessionId}] Session cleaned up`);
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error(`[${sessionId}] ❌ Signaling WebSocket error:`, error);
  });

  // Create and send offer (after message handler is set up)
  try {
    const offer = await peerManager.createOffer();
    const message: SignalingMessage = {
      type: "offer",
      sdp: offer.sdp!,
    };
    ws.send(JSON.stringify(message));
    console.log(`[${sessionId}] 📤 Offer sent to client`);
  } catch (error) {
    console.error(`[${sessionId}] ❌ Failed to create offer:`, error);
    ws.close(1011, "Failed to create offer");
    return;
  }

  // Ensure XAI is ready (should be ready by now or very soon)
  try {
    await xaiInitPromise;
  } catch (error) {
    // Error already logged and handled above
    return;
  }

  // Start periodic stats collection
  const statsInterval = setInterval(async () => {
    try {
      const stats = await peerManager.getStats();
      sessionManager.updateSessionStats(sessionId, stats);
    } catch (error) {
      // Ignore stats errors
    }
  }, 5000); // Update stats every 5 seconds

  // Clean up interval on disconnect
  ws.on("close", () => {
    clearInterval(statsInterval);
  });
});

// ========================================
// Start Server
// ========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log("🚀 XAI Voice WebRTC Server Starting");
  console.log("=".repeat(60));
  console.log(`📡 API URL: ${API_URL}`);
  console.log(`🔑 API Key: ${XAI_API_KEY ? "Configured" : "❌ Missing"}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🎙️  Voice: ${VOICE}`);
  console.log(`📝 Instructions: ${INSTRUCTIONS.substring(0, 50)}...`);
  console.log(`🔒 CORS Origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log("=".repeat(60));
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Session endpoint: POST http://localhost:${PORT}/session`);
  console.log("=".repeat(60));

  if (!XAI_API_KEY) {
    console.log("⚠️  WARNING: XAI_API_KEY not configured!");
    console.log("⚠️  Create a .env file with your XAI_API_KEY");
  }
});



