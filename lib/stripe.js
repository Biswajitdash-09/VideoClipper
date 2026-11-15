import Stripe from "stripe";

let client;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

export function appUrl() {
  const url = process.env.APP_URL;
  if (!url) {
    throw new Error("APP_URL is not set");
  }
  return url.replace(/\/$/, "");
}
