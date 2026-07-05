import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

await page.goto("http://localhost:3000/video-convert", { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  try {
    const ffmpeg = await (window).__testLoadEngine();
    return { ok: true, loaded: !!ffmpeg };
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e) };
  }
});
console.log("loadEngine result:", JSON.stringify(result, null, 2));

// Now try an actual tiny conversion using a synthetic short video generated in-browser via canvas+MediaRecorder,
// to sanity check ffmpeg.exec() actually runs end-to-end (not just load()).
const convertResult = await page.evaluate(async () => {
  try {
    const ffmpeg = await (window).__testLoadEngine();

    // Build a minimal 1-second webm video via canvas capture stream.
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${frame * 30}, 70%, 50%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      frame++;
    }, 100);
    await new Promise((r) => setTimeout(r, 1200));
    clearInterval(timer);
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: "video/webm" });
    const inputBytes = new Uint8Array(await blob.arrayBuffer());

    await ffmpeg.writeFile("in_test.webm", inputBytes);
    await ffmpeg.exec([
      "-i", "in_test.webm",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
      "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
      "-an",
      "out_test.mp4",
    ]);
    const data = await ffmpeg.readFile("out_test.mp4");
    return { ok: true, inputSize: blob.size, outputSize: data.byteLength };
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e) };
  }
});
console.log("convert result:", JSON.stringify(convertResult, null, 2));

console.log("--- console logs (last 40) ---");
logs.slice(-40).forEach(l => console.log(l));

await browser.close();
