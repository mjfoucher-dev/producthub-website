---
title: Harvey at PwC
kind: Product brief 01
date: 2026-11-05
session: Fall Event 2026
description: How PwC rolled out Harvey for legal, tax and deal work, how the platform is built to be trusted, and five lessons for product owners. One page.
file: /resources/brief-01-harvey-at-pwc.pdf
thumb: /resources/brief-01-harvey-at-pwc.jpg
related: /newsletter/issue-1
relatedLabel: "Read the write-up in Issue #1"
---

Harvey is the AI platform PwC uses for high-stakes legal, tax and deal work. This brief, from our Fall Event on November 5, 2026, covers how PwC adopted it, how the platform is built to be trusted, and what product owners can take from it.

## Harvey at PwC in numbers

- **$15.5B:** Harvey's valuation after a $550M raise in September 2026.
- **25,000+:** PwC staff with access, as of October 2026.
- **90+:** countries where it's deployed.
- **100,000:** documents that can be ingested for confident processing.

## How it works

A user asks a question. An orchestration layer breaks it into sub-tasks, routes each one to the best-suited model and evaluates the results. OpenAI, Anthropic and Google models are used automatically, and Mistral is an opt-in for the EU. One query can mean dozens to hundreds of model calls. The answer comes back with citations, and the model weights are never changed.

## Built to be trusted

- **No training on PwC data.** Answers come from retrieval at question time, with citations to file and page.
- **Zero retention, no human review,** with every model provider.
- **Storage by territory:** a separate datastore per territory, encrypted with keys PwC holds.
- **Certified:** SOC 2 Type 2, ISO 27001, ISO 42001 and GDPR.

## Five lessons for product owners

1. **Buy the engine, build the edge.** PwC licensed a platform and built its own workflows on top, rather than starting from scratch.
2. **Trust is a feature, not a sign-off.** Security and trust were part of the product from day one.
3. **Retrieve, don't retrain.** Harvey finds the relevant documents when you ask and cites them. It doesn't learn from client data.
4. **Design for focused questions.** A focused question gets a sharper answer than a bigger pile of documents.
5. **Adoption is part of the product.** Training before anyone got access, champions on each team, and reclaiming licences unused for 60 days were planned as part of the rollout.
