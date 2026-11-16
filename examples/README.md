# First useful tasks

These are deliberately small tasks with a visible result and no private data.
They are examples, not claims that every KDE configuration has been tested.
Complete the [backend setup](../README.md#enable-desktop-control-deliberately)
before using the desktop agent.

## Calculator: first success

Open KDE Calculator (`kcalc`) yourself, select
`/agent copilot-kubuntu-desktop-kit:desktop-operator`, and use:

> In the KCalc window, calculate 19 multiplied by 23 using the visible calculator
> controls. Read the result back. Do not use a shell, other applications, or
> change the calculator's settings. Stop if the target is ambiguous.

**Expected result:** the calculator displays **437**. Verify that result yourself.
The demonstration is successful only if the GUI changed—not if the model
calculated the answer independently. Approve capture/control dialogs directly
and interrupt if an unrelated window is targeted.

**Observed run:** the packaged agent completed this calculation in KCalc
26.08.1 through semantic AT-SPI button actions and read back 437. See the
[approved calculator-only capture](../site/assets/kcalc-result.png).
The run used Copilot CLI 1.0.112 and backend v0.7.53 with a fresh application
configuration. It is not a portal-pointer or keyboard-input test.

## Disposable editor: text fidelity

Open a **new, empty** Kate/KWrite document. Do not use an existing document.

> In this empty editor document, enter exactly `alpha bravo charlie 12345`.
> Read back the text and verify an exact match. Leave the document unsaved.
> Do not open files, use a terminal, or inspect other documents.

**Expected result:** all 25 characters are present, including spaces.
Close and discard only this disposable document yourself.
Do not treat successful dispatch or a matching character count as exact-text
verification.

## Python: a project-scoped change

From a repository with an existing Python test suite, select `python-engineer`:

> Read this repository's instructions and Python configuration. Add one
> regression test for the bug I describe, make the smallest fix, and run the
> existing focused checks. Do not replace system Python or regenerate unrelated
> lockfiles.

Supply a concrete bug. No desktop-control backend is needed for this agent.

## GPU: establish correctness first

Select `cuda-engineer`:

> Inspect this project's GPU requirements and the current driver/runtime.
> Run its smallest bounded GPU correctness check. Report whether computation
> actually ran on the GPU. Do not install drivers, benchmark indefinitely,
> change power settings, or silently fall back to CPU.

Do not run an expensive workload merely to demonstrate the kit.

## Report a result without leaking your desktop

Include only:

- kit release, Copilot version and KDE/Wayland versions;
- example attempted and the first failing stage;
- pass/fail for the visible result and rollback;
- relevant display scale or keyboard layout, if needed;
- an optional error code with sensitive details removed.

Do not attach tokens, normal desktop screenshots, private code, complete
configuration directories or raw journals. A permission denial is a valid
outcome; the agent must stop rather than seek broader access.
