// Builds the text that "Analyze in Claude / ChatGPT" copies to the clipboard.
// Both destinations receive the same generated method used by the installed skill.
import { ANALYSIS_METHOD } from "./review-intelligence-method.js";

export const CHAT_PREFILL =
  "Analyze the app reviews I'm pasting below. The instructions and my question are at the top of the paste.";
export const CLAUDE_PREFILL = CHAT_PREFILL;
export const CLAUDE_NEW_CHAT_URL = `https://claude.ai/new?q=${encodeURIComponent(CLAUDE_PREFILL).replace(/'/g, "%27")}`;
export const CHATGPT_NEW_CHAT_URL =
  `https://chatgpt.com/?q=${encodeURIComponent(CHAT_PREFILL).replace(/'/g, "%27")}`;

// Keep the existing bounded review sample for the ChatGPT handoff.
export const CHATGPT_REVIEW_CAP = 150;

export const DEFAULT_QUESTION_ID = "first-read";

export const QUESTION_GROUPS = [
  {
    label: "Start here",
    questions: [
      {
        id: "first-read",
        label: "First useful read (best start)",
        description: "The two or three things in these reviews you'd most likely miss, and why they matter.",
        prompt: "Give me the first useful read: the two or three things in these reviews I would most likely miss, and why they matter."
      }
    ]
  },
  {
    label: "Before you build",
    questions: [
      {
        id: "wishes",
        label: "What do users wish this app did?",
        description: "The unmet needs and gaps users keep asking someone to solve.",
        prompt: "What do users wish this app did? Find unmet needs and gaps a competitor could fill."
      },
      {
        id: "switching",
        label: "Why do people switch apps?",
        description: "The alternatives people name, and what makes them leave or arrive.",
        prompt: "Why do people switch to or away from this app? Look for the alternatives they name and what triggers the switch."
      },
      {
        id: "underserved",
        label: "Which users does it serve badly?",
        description: "The people and use cases this app repeatedly lets down.",
        prompt: "Which users or use cases does this app serve badly? Look for underserved segments."
      }
    ]
  },
  {
    label: "Product",
    questions: [
      {
        id: "value",
        label: "What keeps people coming back?",
        description: "The habits, outcomes and moments that keep people coming back.",
        prompt: "What keeps people coming back? Find the durable value and habits, in the users' own words."
      },
      {
        id: "friction",
        label: "What breaks, and when do people give up?",
        description: "The failures and missing pieces that turn use into abandonment.",
        prompt: "What breaks, and when do people give up? Separate bugs, missing features and failure sequences."
      },
      {
        id: "onboarding",
        label: "Where does onboarding lose people?",
        description: "Where sign-up, setup or the first session loses people.",
        prompt: "Where do onboarding, sign-up or the first session lose people?"
      }
    ]
  },
  {
    label: "Money",
    questions: [
      {
        id: "price",
        label: "Is it the price, or when the price appears?",
        description: "Whether people mind the price itself, or when and how the paywall shows up.",
        prompt: "Is the complaint about the price itself, or about when and how the price or paywall appears?"
      },
      {
        id: "refunds",
        label: "What turns a trial into a refund request?",
        description: "The sequence from trial or subscription to regret, refund and one star.",
        prompt: "What turns a trial or subscription into a refund request or a one-star review?"
      },
      {
        id: "trust",
        label: "What makes people feel unsafe paying?",
        description: "The moments that make payment, billing or the product feel unsafe.",
        prompt: "What makes people feel unsafe paying for or trusting this app?"
      }
    ]
  },
  {
    label: "Marketing",
    questions: [
      {
        id: "language",
        label: "Which words do happy users use?",
        description: "The distinctive phrases happy users use, plus what you should not claim.",
        prompt: "Which exact words and phrases do happy users use? Give me language worth testing in positioning, ranked by how distinctive it is, plus what not to claim."
      },
      {
        id: "creative",
        label: "What should screenshots and ads say?",
        description: "The message directions reviews support for screenshots and ads.",
        prompt: "What should the screenshots and ads say? Start with Say / Test / Avoid, then the evidence. Message directions, not final copy."
      },
      {
        id: "claims",
        label: "Which claims are safe to make?",
        description: "Which promises the evidence supports, weakens or contradicts.",
        prompt: "Which marketing claims do these reviews support, and which would they contradict? Sort them into safe, needs proof, and avoid."
      }
    ]
  },
  {
    label: "Support",
    questions: [
      {
        id: "support",
        label: "Where does support fail?",
        description: "Where help and recovery break down, and what users do next.",
        prompt: "Where does support or recovery fail, and how do people react when it does?"
      },
      {
        id: "versions",
        label: "What changed across versions or dates?",
        description: "What appears to improve or worsen across dates and versions.",
        prompt: "What changed across app versions or over time in these reviews?"
      }
    ]
  }
];

const ALL_QUESTIONS = QUESTION_GROUPS.flatMap((group) => group.questions);

export function findQuestion(id) {
  return ALL_QUESTIONS.find((question) => question.id === id)
    || ALL_QUESTIONS.find((question) => question.id === DEFAULT_QUESTION_ID);
}

// Keeps the export header and the first `maxReviews` review blocks (the export is newest first).
export function limitReviews(markdown, maxReviews = Infinity) {
  const text = String(markdown || "").trim();
  const firstReview = text.search(/^### Review \d+\n\n- Rating:/m);
  if (firstReview === -1) return { text, included: 0, total: 0 };

  const header = text.slice(0, firstReview).trimEnd();
  const blocks = text.slice(firstReview).split(/\n(?=### Review \d+\n\n- Rating:)/);
  const total = blocks.length;
  const limit = Number.isFinite(maxReviews) && maxReviews > 0 ? Math.floor(maxReviews) : total;
  const kept = blocks.slice(0, limit);

  return {
    text: [header, kept.join("\n").trimEnd()].filter(Boolean).join("\n\n"),
    included: kept.length,
    total
  };
}

export function buildAnalysisPayload({ markdown, questionId, maxReviews = Infinity, method = ANALYSIS_METHOD } = {}) {
  const question = findQuestion(questionId);
  const reviews = limitReviews(markdown, maxReviews);
  const scope = reviews.included < reviews.total
    ? `Only the newest ${reviews.included} of the ${reviews.total} exported reviews are included, so the chat has room to answer. Say this in the first lines of your answer and use ${reviews.included} as the denominator. The rating distribution and date range in the export header describe all ${reviews.total}, not the included reviews.`
    : `All ${reviews.total} exported reviews are included.`;

  const text = [
    method.trim() || ANALYSIS_METHOD,
    `My question: ${question.prompt}`,
    "Answer only this selected question using the method above. Keep the response focused; do not produce a full report or answer other branches unless I ask.",
    `The reviews (Review Intel export, Markdown). ${scope}`,
    reviews.text,
    `Reminder — my question: ${question.prompt}`,
    reviews.included < reviews.total
      ? `Start with the answer in the first lines, and say there that this is the newest ${reviews.included} of ${reviews.total} exported reviews. Then give the evidence.`
      : "Start with the answer in the first lines, then give the evidence."
  ].join("\n\n");

  return { text, question, included: reviews.included, total: reviews.total };
}
