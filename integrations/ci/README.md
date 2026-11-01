# The luck check in CI

`canli-mcp check` works on any CI platform with Node. It computes on the runner, so it needs no key and sends nothing.

```
npx -y canli-mcp check returns.csv --trials 40
```

- **GitHub Actions:** [`action/`](../../action) sends the series to the free API and returns a signed receipt, or run the command above in a step.
- **GitLab:** [`gitlab-validate-backtest.yml`](gitlab-validate-backtest.yml).
- **Hugging Face:** a Space people can use in a browser, in [`../huggingface_space/`](../huggingface_space).
- **Anywhere else:** the command above. `--format json` gives a report, and `--at-least 0.95` makes the job fail under a floor you choose.

The report gives the file's SHA-256, so it can be tied to the exact series. It records that the check ran on that file. It does not prove a strategy is valid: it never saw the data source, the costs, survivorship or lookahead in how the series was built, and no threshold is an approval.
