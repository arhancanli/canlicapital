# Haircut_SR reference values

`js/fixtures/haircut-sr-reference.json` comes from Harvey and Liu's own `Haircut_SR.m`
(people.duke.edu/~charvey/backtesting/, with `sample_random_multests.m` beside it), run in GNU
Octave. The only edit is its print precision: `%.3f` and `%.1f%%` become `%.12f` and `%.10f%%`, and
the function is renamed `Haircut_SR_precise`, so that the output carries enough digits to compare.

```bash
docker build -t canli-octave scripts/reference/haircut-octave
# put Haircut_SR_precise.m and sample_random_multests.m beside run.m, then:
docker run --rm -v "$PWD/scripts/reference/haircut-octave":/w -w /w canli-octave octave --no-gui --quiet run.m
```

Only the Bonferroni lines are used: Holm and BHY in `Haircut_SR.m` draw simulated tests, so they
change with the random generator. The sixth case is excluded because the code computes the p-value
as `2*(1 - tcdf(t, N-1))`, which rounds to 0 for its t-statistic of about 13.7 and returns an
infinite haircut Sharpe ratio.

`js/fixtures/student-t-reference.json` and `js/fixtures/p-adjust-reference.json` come from
`scripts/reference/student-t.R` and `scripts/reference/p-adjust.R` in the r-base image with jsonlite.
