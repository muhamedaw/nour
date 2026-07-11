---
name: bos-ecommerce
description: E-commerce patterns — product catalog, cart, checkout flow, inventory, orders, admin. Use when building a store, shop, marketplace, product listing, or anything that sells items.
---

# E-commerce
- Data core: products (variants, price in cents, currency), cart (guest via cookie token, merged on login), orders (immutable price snapshot at purchase — never join live product prices).
- Inventory: decrement on payment success, not add-to-cart; oversell guard via DB constraint/transaction.
- Checkout: fewest steps possible; guest checkout allowed; shipping+tax computed before the payment page; Stripe Checkout for payment (see bos-payments).
- Orders: state machine (pending -> paid -> fulfilled -> refunded/cancelled); every transition logged with timestamp+actor.
- Emails on: order confirmation, shipping, refund. Transactional, plain, immediate.
- Admin from day one: order list with status filter, refund button, inventory edit.
- Images: multiple sizes generated at upload; lazy-load grids.
