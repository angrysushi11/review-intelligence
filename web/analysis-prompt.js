// Builds the text that "Analyze in Claude / ChatGPT" copies to the clipboard.
// Both destinations receive the same generated method used by the installed skill.
import { ANALYSIS_METHOD } from "./review-intelligence-method.js";

export const CLAUDE_PREFILL =
  "Analyze the app reviews I'm pasting below. The instructions and my question are at the top of the paste.";
export const CLAUDE_NEW_CHAT_URL = `https://claude.ai/new?q=${encodeURIComponent(CLAUDE_PREFILL).replace(/'/g, "%27")}`;
export const CHATGPT_NEW_CHAT_URL =
  "https://chatgpt.com/";

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
        prompt: "What do users wish this app did? Find unmet needs and gaps a competitor could fill."
      },
      {
        id: "switching",
        label: "Why do people switch apps?",
        prompt: "Why do people switch to or away from this app? Look for the alternatives they name and what triggers the switch."
      },
      {
        id: "underserved",
        label: "Which users does it serve badly?",
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
        prompt: "What keeps people coming back? Find the durable value and habits, in the users' own words."
      },
      {
        id: "friction",
        label: "What breaks, and when do people give up?",
        prompt: "What breaks, and when do people give up? Separate bugs, missing features and failure sequences."
      },
      {
        id: "onboarding",
        label: "Where does onboarding lose people?",
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
        prompt: "Is the complaint about the price itself, or about when and how the price or paywall appears?"
      },
      {
        id: "refunds",
        label: "What turns a trial into a refund request?",
        prompt: "What turns a trial or subscription into a refund request or a one-star review?"
      },
      {
        id: "trust",
        label: "What makes people feel unsafe paying?",
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
        prompt: "Which exact words and phrases do happy users use? Give me language worth testing in positioning."
      },
      {
        id: "creative",
        label: "What should screenshots and ads say?",
        prompt: "What should the screenshots and ads say? Give evidence-backed message directions, not final copy."
      },
      {
        id: "claims",
        label: "Which claims are safe to make?",
        prompt: "Which marketing claims do these reviews support, and which would they contradict?"
      }
    ]
  },
  {
    label: "Support and change over time",
    questions: [
      {
        id: "support",
        label: "Where does support fail?",
        prompt: "Where does support or recovery fail, and how do people react when it does?"
      },
      {
        id: "versions",
        label: "What changed across versions or dates?",
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

export function isQuestionId(id) {
  return ALL_QUESTIONS.some((question) => question.id === id);
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
    ? `Only the newest ${reviews.included} of the ${reviews.total} exported reviews are included, so the chat has room to answer. Use ${reviews.included} as the denominator.`
    : `All ${reviews.total} exported reviews are included.`;

  const text = [
    method.trim() || ANALYSIS_METHOD,
    `My question: ${question.prompt}`,
    `The reviews (Review Retriever export, Markdown). ${scope}`,
    reviews.text
  ].join("\n\n");

  return { text, question, included: reviews.included, total: reviews.total };
}
