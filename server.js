import express from "express";
import axios from "axios";
import chalk from "chalk";
import figlet from "figlet";
import * as dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = 3000;

// 💅 Logging with extra drip
const logTitle = (title: string) => {
  console.log(chalk.cyan(figlet.textSync(title)));
};

const logInfo = (msg: string) => {
  console.log(chalk.green("[INFO]"), msg);
};

const logError = (msg: string) => {
  console.error(chalk.red("[ERROR]"), msg);
};

const logData = (msg: string, data: any) => {
  console.log(chalk.yellow(`[DATA] ${msg}:`), data);
};

// 🤖 GROQ API
const getGroqResponse = async (prompt: string) => {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "mixtral-8x7b-32768",
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
    throw err;
  }
};

// 🎨 PIXABAY API
const getPixabayImages = async (query: string) => {
  try {
    const res = await axios.get(
      `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(
        query
      )}&image_type=photo`
    );
    logInfo("Pixabay dropped the pixels.");
    return res.data.hits.map((hit: any) => hit.webformatURL);
  } catch (err) {
    logError("Pixabay said nuh uh.");
    throw err;
  }
};

// 🧨 Let’s GO
logTitle("SPICY NODE SERVER");

app.get("/", async (req, res) => {
  const prompt = req.query.prompt as string;

  if (!prompt) {
    return res.status(400).json({ error: "Missing ?prompt= parameter" });
  }

  logInfo(`User prompt: "${prompt}"`);

  try {
    const aiResponse = await getGroqResponse(prompt);
    const imageResults = await getPixabayImages(prompt);

    logData("AI said", aiResponse);
    logData("Image results (top 3)", imageResults.slice(0, 3));

    return res.json({
      prompt,
      aiResponse,
      images: imageResults.slice(0, 5),
    });
  } catch (err) {
    logError("Oops! Something exploded internally 💥");
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  logInfo(`Server is running on http://localhost:${PORT}`);
});
