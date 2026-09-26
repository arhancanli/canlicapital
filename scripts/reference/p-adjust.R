set.seed(20260926)
fam <- list(
  c(0.01, 0.02, 0.03, 0.04, 0.05),
  c(0.2, 0.001, 0.05, 0.05, 0.9, 0.0001, 0.3),
  c(1e-12, 0.5, 0.5, 0.5),
  runif(50)^3,
  c(0.04, 0.04, 0.04),
  runif(315)^4
)
out <- lapply(fam, function(p) list(p = p, holm = p.adjust(p, "holm"), BY = p.adjust(p, "BY")))
writeLines(jsonlite::toJSON(list(source = paste("R", R.version.string, "p.adjust"), families = out), digits = I(17), auto_unbox = TRUE), "js/fixtures/p-adjust-reference.json")
