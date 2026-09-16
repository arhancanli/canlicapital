# Canli Capital acquisition plan

Prepared 8 September 2026. This is a proposed operating plan, not a promise of traffic or revenue. No posts, messages, partnerships or paid campaigns have been sent or started.

## The proposition

Canli Capital builds its own systematic strategies in the open. ALPHAC is the running research engine; its public execution record is paper. Developers can use the validation API to examine their own results. The company earns attention through useful tools and earns confidence through reproducible work, visible failures and a record that stays available when results disappoint.

Use one sentence consistently: **We run systematic strategies in the open, and give developers the tools to check their own.**

For a developer: “Check your backtest. Keep a reproducible receipt.”
For a researcher: “Follow the hypothesis, the experiment, and the correction.”
For an interested observer: “See what ALPHAC did, and inspect the record behind it.”

Do not position the current API as a market-data feed, execution API, hosted strategy service or buy/sell signal subscription. Those are different products. API receipts preserve a calculation; they do not certify the origin or integrity of a user's dataset. Continuous research is a process, not a promise that performance continuously improves.

## What is already available

The website has a developer quickstart, free key issuance, Python/JavaScript/curl examples, four validation endpoints, receipts, a paper dashboard, open repositories, research papers, correction records and browser calculators. The redesign gives these an understandable entrance while retaining the existing routes.

At 15:51 UTC on 8 September, the public [API status](https://canlicapital.com/api/v1/validate/status) reported a reachable store, zero keys issued that day, zero validations that day and twelve validations in total. The local baseline records twelve validations on 6 September as internal tests. This does not establish external adoption. Counts are a point-in-time observation and can change.

The first job is to find people who repeatedly use one of the tools for real work. Visits, GitHub stars, key issuance and successful requests are different measures. A key is not necessarily a person; one person can issue several. Attribution is partial: missing referrer data must remain unknown.

## Who to pursue first

| Priority | Audience | Immediate problem | Entrance | Activation |
| --- | --- | --- | --- | --- |
| First | Python developers building backtests | A plausible result may be selection bias | A worked notebook or calculator | Validate their own series and inspect the receipt |
| First | Student quant teams and independent researchers | Need a reproducible research workflow | A concrete tutorial or public reproduction task | Reproduce a result or use the validator in a project |
| Next | Backtesting and quant tooling maintainers | Need a useful validation step | Integration example tied to their existing workflow | An accepted integration that produces repeat use |
| Next | Quant educators and technical writers | Need an honest example to teach | A ready-to-run lesson with public inputs | Use the lesson and link its source |
| Supporting | People following systematic research | Want to see decisions and progress | A clear research update | Return to a new release or subscribe voluntarily |

Start with developers and researchers. Investment customers would require a different product and supporting capabilities; today's site does not offer managed capital.

## The complete channel map

These are the relevant acquisition families, with concrete executions. They are options to test, not a recommendation to run every channel at once. “Now” means low-cost learning with the existing product; “next” means after initial activation; “later” means after retention or revenue makes the effort defensible.

| Channel | Concrete execution | Destination / useful outcome | Timing |
| --- | --- | --- | --- |
| Tool SEO | Improve existing deflated Sharpe, overfitting and breadth pages around the question each answers | Existing calculator → API example | Now |
| Tutorial SEO | Publish one complete Python walkthrough using openly usable input data | Reproduction → first validation | Now |
| Research SEO | Add clear abstracts, definitions, assumptions and links between related papers | Research page → matching tool | Now |
| Comparison intent | Explain when DSR, CSCV/PBO and ordinary Sharpe answer different questions | Appropriate calculator | Now |
| Troubleshooting intent | Explain issues such as too few observations, missing trials and invalid return matrices | Corrected request → successful validation | Now |
| Search visibility | Verify sitemap, canonical pages and indexing in the owner's Search Console | Query/page evidence, not guessed rankings | Now |
| AI-assisted discovery | Keep human-readable explanations, code examples, public specs and source links accessible | An assistant can direct a user to a usable example | Now |
| GitHub repository discovery | Put a working quickstart and the relevant hosted tool near the top of each repository | Repository → real use | Now |
| GitHub examples | Publish a small, runnable example repository with declared dependencies and inputs | A fork that runs end to end | Now |
| GitHub Action distribution | Demonstrate the existing validation action on an actual example pull request | Repeat validation during research changes | Now |
| Maintainer contributions | Contribute a relevant example or fix to a library; propose an integration only when it helps | Accepted contribution and continued use | Next |
| Python package discovery | Improve docs and examples for existing packages; only create an API SDK if users need it | Installation → useful computation | Next |
| JavaScript ecosystem | Demonstrate using the existing HTTP API from a notebook or small web tool | Successful request | Next |
| Notebook sharing | Offer a runnable notebook with public inputs and a short explanation | Reproduce first, then supply own data | Now |
| Show HN | Submit the working validator or reproducible tool with a technical write-up | Hands-on trials and candid feedback | Now, after final production checks |
| Hacker News discussions | Answer relevant technical questions with substantive details; disclose authorship when linking | Relevant readers → specific evidence | Ongoing |
| Product Hunt | Launch a defined developer tool with a demo, clear limits and active support | Tool activation | Next |
| Reddit | Contribute useful explanations in relevant quant, algo-trading and Python communities; check each community's current rules before posting | Conversation → relevant tool | Now, selectively |
| Technical Discord/Slack groups | Offer a short walkthrough in groups that permit it; get moderator agreement where needed | A working session with real users | Next |
| Quant forums | Answer implementation questions with reproducible examples | Qualified use | Now |
| Stack Exchange / Q&A | Answer the question fully; only include a relevant link with affiliation disclosed | A helpful answer, not a traffic quota | Ongoing |
| X | Publish a chart or code example with one finding, its limitation and the source | Specific evidence → tool | Now |
| LinkedIn | Explain a research decision or engineering incident in clear language | Researchers / educators → full artifact | Now |
| YouTube | Record a short screen walkthrough: input, validation, receipt, interpretation | Viewer completes the example | Next |
| Short video | Extract one useful demonstration from the longer walkthrough | Full tutorial | Next |
| Technical blogs | Write a complete tutorial on the platform where readers already learn | Executable example | Next |
| Newsletters | Pitch a relevant tool or reproducible finding to carefully selected authors | Qualified readers → exact landing page | Next |
| Guest articles | Coauthor a practical lesson with an educator or maintainer | Trust plus repeated use | Next |
| Podcasts | Offer a specific story about reproducibility, research failures or engine design | Supporting awareness | Later |
| Founder network | Personally invite a few relevant people to try one concrete task | Observed usability and honest feedback | Now |
| Researcher outreach | Reference a person's public work and explain the specific check that may help them | A useful conversation or trial | Now, manually |
| Student societies | Offer a notebook-based workshop to quant/CS clubs | Completed exercise and reuse in projects | Next |
| University teaching | Offer an optional reproducibility exercise, with explicit limitations | Integration into a lesson | Next |
| Meetups | Demonstrate one failure that the validator can expose using a runnable example | Interested attendees try it | Next |
| Hackathons | Support a research-tool challenge with working examples | Developers build something that persists | Later |
| Tool partnerships | Build a notebook or validation adapter with a backtesting platform | Repeated use in an existing workflow | Next |
| Data-provider education | Co-create a lesson where data permissions allow redistribution | Good data practice plus validation | Later |
| Independent reproductions | Invite a bounded public reproduction of one published result | External evidence and useful corrections | Now |
| Research challenges | Publish one unresolved, well-specified reproducibility task | Contributions with a clear scope | Next |
| Shareable results | Make an existing receipt easy to cite with its assumptions and limitations | A recipient understands and tries the tool | Now |
| README badges | Demonstrate an honest validation receipt badge in a real repository | Reader → receipt → own check | Next |
| Embeddable tools | Explore a calculator embed only after teachers or writers request it | Partner readers use a relevant tool | Later |
| Opt-in release notes | Send useful releases and specific research changes to subscribers | Return use | Now, with owner sending approval |
| Onboarding follow-up | Offer help to users who explicitly request it; keys are not an email list | Resolve failure before abandonment | Next |
| Referral invitations | Invite satisfied users to share the exact tool that helped them | Another successful user | After satisfaction is demonstrated |
| Directories | List only in maintained, relevant developer or quant directories | Track real downstream use | Next, low time budget |
| Technical awards | Use design/engineering showcases after product quality is demonstrated | Supporting visibility | Later |
| Digital PR | Pitch a reproducible finding or clearly documented incident with actual significance | Earned links and informed readers | Later |
| Sponsorships | Test a small placement in a tightly matched technical newsletter | Cost per activated / retained user | After activation works |
| Search ads | Test narrow tool-intent queries with explicit spend limits | Measured acquisition efficiency | After revenue or a learning budget exists |
| Social ads | Promote a proven demonstration to an appropriate audience | Qualified activation, not clicks | Later |
| Retargeting | Consider only when traffic volume, consent requirements and economics justify it | Incremental return use | Later |
| Affiliates | Consider only for a future paid offer with sound unit economics | Paying retained customers | Later |
| Localization | Translate a proven tutorial when an actual audience needs it | Activated users in that language | Later |

Show HN specifically expects something people can try, preferably with little friction. A landing page or newsletter alone does not qualify. Prepare the working tool as the submission, and be available to explain its implementation. [Show HN guidelines](https://news.ycombinator.com/showhn.html)

Google's current guidance for its AI search features emphasizes the same useful content, crawlability, internal links and technical fundamentals as ordinary search. Treat AI discoverability as part of good documentation and SEO; special “AI files” do not guarantee visibility. [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features)

For Product Hunt, prepare a product people can use and be available to answer questions. Its launch guidance cautions against suddenly spamming communities where you have not participated. [Product Hunt launch guidance](https://www.producthunt.com/launch/sharing-your-launch)

## The first month

The quantities below are proposed work budgets and experiment targets, not forecasts. Assume founder-led execution, roughly an hour a day for distribution, plus a weekly writing/demo block. Adjust to actual capacity.

| Week | Work | Deliverable | Decision |
| --- | --- | --- | --- |
| 1 | Finish preview checks; observe several developers using the quickstart; fix the failures they encounter | One complete tutorial, one short screen demo, working production flow, baseline metrics | Can a new person complete a useful validation unaided? |
| 2 | Share the tutorial in two relevant places; personally invite a small set of suitable researchers; prepare a Show HN submission | A few real user sessions and feedback notes | Which message and entry page produce successful use? |
| 3 | Publish a follow-up on a real failure or misconception; propose one integration; run one small workshop if there is interest | A repeatable notebook or integration example | Are people returning with their own data? |
| 4 | Compare activation and repeat use by source; improve the winning journey; decide whether a Product Hunt launch is useful | A brief experiment report and next-month priorities | Continue the two best channels; pause those that create only visits |

Weekly publication rhythm: one substantial tutorial or research note, one operating update with a dated source, and a small number of useful replies in relevant discussions. Repurpose the same verified finding into a post and a video rather than creating unrelated claims for each channel.

## First content queue

1. “Validate a backtest in Python, from returns to receipt.” Give exact runnable steps and explain what the result does and does not establish.
2. “Why testing more strategies changes what your Sharpe ratio means.” Link the DSR calculator and include the number of trials.
3. “What a paper record can tell you, and what it cannot.” Use the public record with a date and capital basis.
4. “A correction from our own research.” Trace the old claim, the evidence that changed it, and the resulting correction.
5. “Put a validation check in your research pull request.” Demonstrate the existing action and a receipt.
6. “Reproduce this selected result from public inputs.” Link the portable reproduction package and document assumptions.
7. “Why correlated strategies do not add independent breadth.” Use the breadth calculator with a clearly labeled example scenario.
8. “Follow one ALPHAC decision from input to public record.” Link each available artifact and identify missing evidence.

Every article should solve one question, include the actual example, and have one primary next action. Avoid making readers traverse the homepage again to find the tool.

## Measurement and learning

Use `npm run arrivals -- https://canlicapital.com` for the aggregate API view already implemented. Its daily counts do not provide a retention cohort. Keep internal smoke tests separate when interpreting results. Referrer and snippet labels can suggest an origin but do not establish a unique user or reliable attribution across sessions.

Recommended future funnel: entry page → quickstart opened → key issued → first successful validation → receipt inspected → repeat validation on a later day. Define an activated developer as a key completing a useful validation, while acknowledging that keys are only a proxy for developers. Define repeat use over a declared time window and exclude internal test labels. These extra funnel and retention measurements are proposed instrumentation, not currently verified capabilities.

For content and research, measure repeat visits to new research, opted-in subscriptions, reproduction attempts, substantive issues and accepted external contributions separately from API activation. An independent reproduction should be counted only when there is an inspectable result.

Keep a weekly experiment sheet with: source, audience, message, destination, time/spend, qualified visits if available, successful validations, repeat use if measurable, feedback, and next decision. Do not hide unknown attribution or average different audiences into one conversion claim.

A sensible first milestone is a small group of external developers who return and can explain why the tool helps. Numerical targets should be set once the baseline and capacity are known. Paid spend is premature while there is no demonstrated retention or paid offer.

## Product loops to strengthen

- Tutorial → calculator → API → repeat use in a notebook or CI pipeline.
- Research finding → runnable reproduction → external issue or contribution → a better published result.
- Strategy update → public evidence → opt-in reader → the next substantive update.
- Useful receipt → voluntary citation or badge → a new person checks their own work.

Each loop starts with something useful. Keep failure states actionable: explain invalid inputs, exhausted quotas, unavailable storage and what a receipt actually establishes. Preserve a local/open-source path where the existing tools support one.

## Ready-to-review launch copy

### Show HN title

Show HN: Canli Capital, an open backtest validator with reproducible receipts

### First comment draft

I’m building ALPHAC, a systematic research engine with a public paper record. As part of that work, I opened the validation arithmetic as a free API and browser tools.

You can bring your own results, examine selection bias and backtest overfitting, and keep a reproducible receipt. The quickstart includes Python, JavaScript and curl examples. The cores are open source.

The calculation does not establish that a dataset is clean or that a strategy will make money. The API checks the inputs submitted to it. Our own strategies are published as paper execution, with the research and corrections available to inspect.

I’d particularly like feedback on whether the input contract and the result are clear enough to use in a real research workflow.

### LinkedIn / X draft

We build our own systematic strategies at Canli Capital, and publish the work around them: paper execution, experiments, and corrections.

The validation tools are now available to other developers. Bring your own returns, run a check, and inspect a reproducible receipt. There are examples for Python, JavaScript and curl, with a free API key.

Start here: https://canlicapital.com/developers#quickstart

### Personal invitation draft

Hi [name], I saw your work on [specific public project]. I’m building Canli Capital's open validation tools, and [specific check] may be relevant to [specific step in their workflow]. Here is a runnable example: [exact link]. If you try it, I’d be interested in where the inputs or output are unclear. The service evaluates the submitted data; it does not verify the data source or predict future performance.

### Newsletter pitch draft

I built a free tool your readers can try with their own backtest results. It covers selection bias and overfitting and returns a reproducible receipt, with Python and JavaScript examples. Here is the tutorial: [published link]. If useful for your newsletter, I can provide a concise walkthrough and the limitations, with links to the open-source calculation.

## What “excellent” means here

The design explains the business quickly, works by keyboard and on phones, and keeps data labels legible. The key flow works without surprises. The published figures remain source-bound. Existing pages resolve. The product makes a useful task easier. Marketing makes it easier for the right people to discover that task. Results and unresolved problems are recorded honestly.

A launch does not end this work. Use what actual users do and where they struggle to choose the next improvement.
