import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_VOICE_AUDIO_BYTES,
  transcribeVoiceAudio,
} from "../voice-transcription.mjs";

test("sends a validated audio recording to Gemini and returns its transcript", async () => {
  const audio = Buffer.from("sample audio");
  let requestUrl;
  let requestOptions;
  const transcript = await transcribeVoiceAudio(
    { audio, mimeType: "audio/webm;codecs=opus" },
    "test-key",
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Pay the rent tomorrow." }] } }],
        }),
      };
    }
  );

  assert.equal(transcript, "Pay the rent tomorrow.");
  assert.match(requestUrl, /generateContent$/);
  assert.equal(requestOptions.headers["x-goog-api-key"], "test-key");
  const requestBody = JSON.parse(requestOptions.body);
  assert.deepEqual(requestBody.contents[0].parts[1].inlineData, {
    mimeType: "audio/webm",
    data: audio.toString("base64"),
  });
});

test("accepts a binary audio file from a multipart upload", async () => {
  const audio = Buffer.from("sample audio");
  let requestOptions;
  await transcribeVoiceAudio(
    { audio, mimeType: "audio/mp4" },
    "test-key",
    async (_url, options) => {
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Call Alex." }] } }],
        }),
      };
    }
  );
  const requestBody = JSON.parse(requestOptions.body);
  assert.deepEqual(requestBody.contents[0].parts[1].inlineData, {
    mimeType: "audio/mp4",
    data: audio.toString("base64"),
  });
});

test("rejects unsupported audio without contacting Gemini", async () => {
  let requested = false;
  await assert.rejects(
    transcribeVoiceAudio(
      { audio: Buffer.from("sample audio").toString("base64"), mimeType: "text/plain" },
      "test-key",
      async () => {
        requested = true;
      }
    ),
    (error) => error.status === 400
  );
  assert.equal(requested, false);
});

test("rejects audio larger than the upload limit", async () => {
  const audio = Buffer.alloc(MAX_VOICE_AUDIO_BYTES + 1).toString("base64");
  await assert.rejects(
    transcribeVoiceAudio({ audio, mimeType: "audio/webm" }, "test-key"),
    (error) => error.status === 413
  );
});

test("surfaces Gemini quota errors without exposing response bodies", async () => {
  await assert.rejects(
    transcribeVoiceAudio(
      { audio: Buffer.from("sample audio").toString("base64"), mimeType: "audio/webm" },
      "test-key",
      async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "provider detail" } }),
      })
    ),
    (error) => error.status === 429 && /quota/.test(error.message)
  );
});
