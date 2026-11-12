# The sleeve hub

A sleeve is a strategy as data: a recipe that already exists in this server, fixed parameters, the reason for it and its risks. No contributor's code ever runs.

## Add one

1. Write a JSON file like the others in this folder, named after its `id` (`your-github-name/sleeve-name` becomes `your-github-name-sleeve-name.json`), and add the file name to `index.json`.
2. Run `hub_check` on it. It checks the format, the parameters against the recipe's rules, and the wording.
3. Open a pull request with the file. A person reads every one.

## What gets refused

- Performance claims. Results come from running a sleeve on someone's data, so a sleeve's text never states any.
- Links in the text, markup, or anything addressed to the model or person reading it. References are citations.
- New code. If a recipe you need does not exist, propose the recipe itself as a separate pull request with its tests.

## What being listed means

It means the file is well formed and a person read it. It does not mean the sleeve works. Run it on your own data and count every sleeve you try: `validate_deflated_sharpe` sets the best against how many you tried.
