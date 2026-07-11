---
name: bos-payments
description: Payment integration patterns — Stripe checkout, subscriptions, webhooks, idempotency, refunds, test mode. Use when a project charges money, sells, has subscriptions, billing, or a paywall.
---

# Payments (Stripe patterns)
- Never build card forms: Stripe Checkout/Payment Links first, Elements only when embedding is required.
- Source of truth = webhooks (checkout.session.completed, invoice.paid, customer.subscription.updated), not the redirect page. Verify webhook signatures.
- Idempotency keys on every create call; webhook handlers safely re-runnable (upsert by event id).
- Store: stripe_customer_id, subscription status, current_period_end. Gate features off local status, refreshed by webhooks.
- Prices/products defined in the Stripe dashboard or seeded via API — never hardcoded in UI alone.
- Test mode end-to-end with stripe listen before any live key. 4242 card happy path, 4000-0000-0000-9995 declines.
- Refund and cancellation flows are part of MVP, not later.
