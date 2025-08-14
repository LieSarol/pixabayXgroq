import http from "http";
import { config } from "dotenv";
import axios from "axios";
import chalk from "chalk";
import figlet from "figlet";
import { URL } from "url";
import { buildClient } from "@xata.io/client";

config(); // Loads .env

const logTitle = (title) => {
  console.log(chalk.cyan(figlet.textSync(title)));
};
const logInfo = (msg) => console.log(chalk.green("[INFO]"), msg);
const logError = (msg) => console.error(chalk.red("[ERROR]"), msg);
const logData = (msg, data) => console.log(chalk.yellow(`[DATA] ${msg}:`), data);

const xata = buildClient({
  databaseURL: process.env.XATA_DB_URL,
});

const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

// GROQ AI endpoint (your original setup)
const getGroqResponse = async (prompt) => {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      }
    );
    logInfo("Groq served us some fresh AI vibes.");
    return res.data.choices[0].message.content;
  } catch (err) {
    logError("Groq API said nope.");
    if (err.response) console.error(chalk.red("[GROQ ERROR]"), err.response.data);
    throw err;
  }
};
const handleAI = async (res, prompt) => {
  try {
    const aiResponse = await getGroqResponse(prompt);
    logData("AI vibed back:", aiResponse);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ aiResponse }));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI fetch failed" }));
  }
};

//  Unsplash API magic
const getUnsplashRandomImage = async (query) => {
  try {
    const res = await axios.get("https://api.unsplash.com/photos/random", {
      params: { query, count: 5 }, // how many random images you want
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    });
    logInfo("Unsplash delivered some spicy random shots.");
    
    // API returns an array when count > 1
    return res.data.map((img) => img.urls.regular);
  } catch (err) {
    logError("Unsplash API said nuh uh.");
    if (err.response) console.error(chalk.red("[UNSPLASH ERROR]"), err.response.data);
    throw err;
  }
};

const handleImage = async (res, prompt) => {
  try {
    const imageResults = await getUnsplashRandomImage(prompt);
    logData("Random image results", imageResults);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ prompt, images: imageResults }));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Image fetch failed" }));
  }
};

const handleInsert = async (req, res) => {
  try {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      const { title, description, content } = JSON.parse(body);
      if (!title || !description || !content) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Missing one or more fields: title, description, content",
          })
        );
      }
      const record = await xata.seo.create({ title, description, content });
      logData("Inserted to Xata", record);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, record }));
    });
  } catch (err) {
    logError("Xata insert failed");
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Insert failed" }));
  }
};

logTitle("COOL SERVER");

const server = http.createServer(async (req, res) => {
  setCORS(res);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const path = parsedUrl.pathname;
  const prompt = parsedUrl.searchParams.get("prompt");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET") {
    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing ?prompt= parameter" }));
    }
    if (path === "/ai") {
      logInfo(`Calling /ai with prompt: "${prompt}"`);
      return handleAI(res, prompt);
    }
    if (path === "/image") {
      logInfo(`Calling /image with prompt: "${prompt}"`);
      return handleImage(res, prompt);
    }
  }

  if (req.method === "POST" && path === "/insert") {
    logInfo(`Received POST to /insert`);
    return handleInsert(req, res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unknown endpoint" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => logInfo(`Server vibin’ on http://localhost:${PORT}`));
