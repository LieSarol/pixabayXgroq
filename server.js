import http from "http";
import { config } from "dotenv";
import axios from "axios";
import chalk from "chalk";
import figlet from "figlet";
import { URL } from "url";
import { buildClient } from "@xata.io/client";

config(); // Load .env

// 💅 Logging with extra drip
const logTitle = (title) => {
  console.log(chalk.cyan(figlet.textSync(title)));
};

const logInfo = (msg) => {
  console.log(chalk.green("[INFO]"), msg);
};

const logError = (msg) => {
  console.error(chalk.red("[ERROR]"), msg);
};

const logData = (msg, data) => {
  console.log(chalk.yellow(`[DATA] ${msg}:`), data);
};

// 💾 Xata Setup (IN SERVER FILE, just for you 💪)
const xata = buildClient({
  databaseURL: process.env.XATA_DB_URL,
});

// CORS headers 🎉
const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

// 🤖 GROQ API
const getGroqResponse = async (prompt) => {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );
    const content = res.data.choices[0].message.content;
    logInfo("Groq served us some fresh AI vibes.");
    return content;
  } catch (err) {
    logError("Groq API said nope.");
    if (err.response) {
      console.error(chalk.red("[GROQ ERROR RESPONSE]"), err.response.data);
    } else if (err.request) {
      console.error(chalk.red("[GROQ NO RESPONSE]"), err.request);
    } else {
      console.error(chalk.red("[GROQ CONFIG ERROR]"), err.message);
    }
    throw err;
  }
};

// 🎨 PIXABAY API
const getPixabayImages = async (query) => {
  try {
    const res = await axios.get(
      `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(
        query
      )}&image_type=photo`
    );
    logInfo("Pixabay dropped the pixels.");
    return res.data.hits.map((hit) => hit.webformatURL);
  } catch (err) {
    logError("Pixabay said nuh uh.");
    throw err;
  }
};

// 🧠 /ai endpoint
const handleAI = async (res, prompt) => {
  try {
    const aiResponse = await getGroqResponse(prompt);
    logData("AI said", aiResponse);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ prompt, aiResponse }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI fetch failed" }));
  }
};

// 📸 /image endpoint
const handleImage = async (res, prompt) => {
  try {
    const imageResults = await getPixabayImages(prompt);
    logData("Image results (top 3)", imageResults.slice(0, 3));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ prompt, images: imageResults.slice(0, 5) }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Image fetch failed" }));
  }
};

// 💾 /insert endpoint
const handleInsert = async (req, res) => {
  try {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      const { title, description, content } = JSON.parse(body);

      // Validate only title, description, and content
      if (!title || !description || !content) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing one or more fields: title, description, content" }));
      }

      // Insert only these three fields into Xata
      const record = await xata.db.seo.create({
        title,
        description,
        content,
      });

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

// 🧨 Start server
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
server.listen(PORT, () => {
  logInfo(`Server listening on http://localhost:${PORT}`);
});
