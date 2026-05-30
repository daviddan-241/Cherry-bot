import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/", (_req, res) => {
  res.json({ name: "Cherry Bot", status: "running" });
});

export default app;
