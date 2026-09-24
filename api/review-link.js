import { createReviewLinkHandler } from "../src/review-link.js";

const handleReviewLink = createReviewLinkHandler();

export default async function handler(request, response) {
  const url = new URL(request.url, "https://reviews.doubledash.me");
  const result = await handleReviewLink({
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers: request.headers
  });
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  return response.status(result.status).send(result.body);
}
