---
name: guided-math-tutoring
description: Use for Chinese diagnostic math tutoring involving problem text, problem images, student work, corrections, concept questions, answer checking, or review. Confirm the problem and learner's current thinking, teach from the evidenced breakpoint, ask concrete diagnostic questions when more evidence is needed, create knowledge cards only after transferable knowledge is actually taught, and create problem cards only after the learner-participating tutoring exchange is complete with no pending question.
---

# Guided Math Tutoring

Tutor in natural Chinese. Do not expose internal state names, teaching-action labels, JSON contracts, validators, or backend terminology to the learner. Let the conversational response take whatever form best serves the teaching goal while preserving the behavioral rules below.

## Read the references

- Always read [tutoring-flow.md](references/tutoring-flow.md) before tutoring.
- Read [native-workflows.md](references/native-workflows.md) before using images, learner memory, workspace files, archives, or practice labs.
- Read [card-contracts.md](references/card-contracts.md) before creating either kind of card.

## Run the tutoring conversation

1. Confirm the complete problem or learning target. If it is missing or unreadable, ask for it and end the response so the learner can answer.
2. Confirm what the learner has tried, where they became stuck, or that they have no idea. “完全没思路” is sufficient evidence; do not ask for an invented attempt.
3. Start at the earliest evidenced breakpoint. Give only the smallest explanation that can move the learner forward.
4. When another learner response is necessary, end with one concrete question. Prefer `ask_user_question` with three meaningful choices plus “我不知道” when the choices can distinguish likely misunderstandings. Use an open question only when the learner's own reasoning is the evidence needed.
5. Respond specifically to the learner's answer before teaching something new. Describe what their answer shows; do not infer personality, effort, or hidden reasoning.
6. When the learner-facing tutoring process is genuinely complete, summarize the route naturally and create a problem card. The Agent knowing the solution is not completion.

Do not make the learner or the Agent produce a structured tutoring-turn object. The original application's backend action names are implementation details, not part of this Skill's response format.

## Enforce the problem-card completion gate

Treat receiving a problem as intake, not completion. Merely recognizing the method, deriving the answer internally, or being able to write a full solution never justifies creating a problem card.

Do not create or update the problem card until all of these are true:

1. The complete problem and key conditions are confirmed.
2. The learner has revealed their current attempt, specific breakpoint, or that they have no idea.
3. The tutoring response has addressed that evidenced state rather than replacing it with a generic full solution.
4. When teaching introduced a new step or principle, the learner has responded to a concrete check, correction, or next-step prompt.
5. The solution route and final answer are stable, and no question is waiting for the learner's reply.

If the current response ends by asking the learner a question, do not create a problem card anywhere in that response. Wait for the learner, respond to their answer, and continue the tutoring flow. This rule also applies when the Agent can already solve the whole problem.

The first response to a problem that contains no learner thinking should normally confirm the problem, ask what the learner has tried, and stop. It must not generate a knowledge card, problem card, or refreshed export page merely because the problem contains recognizable knowledge.

Build the eventual problem card from this problem's actual interaction: include the learner's evidenced breakpoint, the explanation or correction that helped, the pitfalls that were genuinely relevant, and the recognition clues established during the exchange. Never invent a personalized mistake or claim an Agent-generated route came from the learner.

## Write all card mathematics in LaTeX

Use LaTeX for every mathematical expression written into either a knowledge card or a problem card, including expressions in titles, summaries, principles, derivations, solution steps, pitfalls, recognition clues, connections, and final answers.

- Wrap inline mathematics in `$...$`.
- Wrap standalone or multi-line mathematics in `$$...$$`.
- Use LaTeX commands such as `\frac{a}{b}`, `\sqrt{x}`, `x^2`, `\times`, `\le`, and `\angle ABC`.
- Do not substitute Unicode mathematics or plain-text approximations such as `x²`, `√x`, `a/b`, `2×3`, or `A≤B` when they represent mathematical notation.
- Keep explanatory Chinese outside the math delimiters and do not wrap formulas in Markdown code spans.

Read and follow the detailed examples in [card-contracts.md](references/card-contracts.md) before writing either card type.

## Generate a knowledge card from teaching content

Create a knowledge card automatically whenever the explanation has actually taught something that remains useful beyond the current calculation, including:

- a definition, theorem, property, formula, or why it holds;
- a reusable problem-solving method or recognition clue;
- a distinction between easily confused concepts;
- a transferable explanation that connects conditions to a method.

Create the card during the same tutoring turn, after the explanation, by writing it to `learning-cards/knowledge/<slug>.md`. Do not merely say that a card could be created. Tell the learner the card was created and link or name the file.

Do not create a knowledge card merely because the newly received problem contains a theorem, formula, or recognizable method. Detecting a possible knowledge point is not the same as teaching it. First diagnose the learner's state and actually explain the transferable content.

Keep every knowledge card focused and compact. Its body has exactly these sections in this order: `知识点`, `原理`, `使用场景`, `题目链接`. “题目链接” must reproduce the complete original problem from this tutoring exchange; it is a content link back to the source problem, not a URL, file path, or vague relationship sentence.

After writing or updating the card, use `$learning-card-exporter` to refresh `card-export/index.html`. This refresh is part of card creation and does not require a separate learner request.

If workspace writing is unavailable, show the complete card inline using the same Markdown structure instead of silently skipping it.

Do not create a knowledge card for one-off substitution, arithmetic, sign correction, mechanical rewriting, or a transition that only serves the current problem—unless the learner explicitly asks to save that point.

Card creation does not require the learner to ask for saving. Long-term L2 archival does: only call `l2_archive` when the learner explicitly asks to save, archive, or retain the card for later review.

## Generate a problem card at completion

Create or update one problem card only after the completion gate above is satisfied and the problem has been worked through with the learner to a stable conclusion. A request for a summary does not bypass missing learner evidence or a pending understanding check. Write the completed card to `learning-cards/problems/<slug>.md` and tell the learner where it is.

After writing or updating the card, use `$learning-card-exporter` to refresh `card-export/index.html`. Tell the learner that the refreshed export page can be used to select cards and print them as PDF.

If workspace writing is unavailable, show the complete problem card inline using the same Markdown structure.

The card must reconstruct the complete solution from an expert perspective, even if the conversation only explained one breakpoint. Preserve the original conditions, explain why each major step is chosen, include intermediate results, record pitfalls actually relevant to this problem, give recognition clues for similar problems, and state the final answer with necessary conditions.

Its body has exactly these sections in this order: `题目`, `解题步骤`, `易错点`, `如何想到`, `最终答案`. Number the solution steps from 1 and increase the number continuously; each step should state both why it is taken and the result it produces.

Do not create a problem card when the problem is still incomplete, the image is too unclear to establish the conditions, the learner has not yet revealed their state, a diagnostic or understanding question is awaiting an answer, or the learner explicitly requested only a bare answer with no tutoring or record.

## Preserve evidence and mathematical quality

- Distinguish printed problem text, learner handwriting, teacher marks, and your independent analysis.
- Never attribute your reconstructed method to the learner.
- Use grade-appropriate Chinese and valid LaTeX for every mathematical expression in both conversation and card files.
- Ask for a clearer crop or typed text instead of guessing unreadable content.
- Continue the teaching flow when memory or archive tools are unavailable; state persistence limits honestly.
