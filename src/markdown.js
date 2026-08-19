export function renderReviewsMarkdown({ dataset, reviews }) {
  const platformLabel = platformName(dataset.platform);
  return [
    `# ${dataset.app_name} Reviews`,
    "",
    "## Dataset",
    "",
    `- App name: ${dataset.app_name}`,
    `- App ID: ${dataset.app_id}`,
    `- Platform: ${platformLabel}`,
    `- Country: ${dataset.country_name || dataset.country}`,
    ...(dataset.platform === "google_play" && dataset.language_name
      ? [`- Google Play ${dataset.language_names?.length > 1 ? "languages" : "language"} used: ${dataset.language_name}`]
      : []),
    ...(dataset.source ? [`- Source: ${dataset.source}`] : []),
    ...(dataset.pages_fetched ? [`- Pages fetched: ${dataset.pages_fetched}`] : []),
    ...(dataset.review_limit ? [`- Requested review limit: ${dataset.review_limit}`] : []),
    `- Unique reviews exported: ${reviews.length}`,
    `- Date range: ${dataset.date_range}`,
    `- Rating distribution: ${ratingDistributionText(dataset.rating_distribution)}`,
    ...(dataset.app_store_category ? [`- Category: ${dataset.app_store_category}`] : []),
    ...(dataset.app_store_genres?.length ? [`- Genres: ${dataset.app_store_genres.join(", ")}`] : []),
    ...(dataset.google_play_installs ? [`- Google Play installs: ${dataset.google_play_installs}`] : []),
    ...(dataset.google_play_score ? [`- Google Play score: ${dataset.google_play_score}`] : []),
    "",
    "## Reviews",
    "",
    ...reviews.flatMap((review, index) => renderReview(review, index + 1))
  ].join("\n");
}

function platformName(platform) {
  if (platform === "google_play") return "Google Play";
  if (platform === "app_store") return "App Store";
  return platform || "Unknown";
}

function renderReview(review, index) {
  return [
    `### Review ${index}`,
    "",
    `- Rating: ${review.rating ?? "Unknown"}`,
    `- Date: ${review.updated || "Unknown"}`,
    ...(review.language ? [`- Language: ${review.language}`] : []),
    ...(review.version ? [`- Version: ${review.version}`] : []),
    ...(review.author ? [`- Author: ${review.author}`] : []),
    ...(review.title ? [`- Title: ${review.title}`] : []),
    "",
    "```text",
    safeFenceText(review.content || review.title || ""),
    "```",
    ""
  ];
}

function ratingDistributionText(distribution = {}) {
  return [1, 2, 3, 4, 5].map((rating) => `${rating}: ${distribution[String(rating)] || 0}`).join(", ");
}

function safeFenceText(value) {
  return String(value || "").replace(/```/g, "'''").trim();
}
