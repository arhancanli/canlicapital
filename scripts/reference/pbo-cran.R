# Reference run of the CRAN pbo package (Matt Barry) on the matrices written by
# scripts/reference/pbo-matrices.mjs. Regenerate the fixture js/fixtures/pbo-cran-reference.json:
#   node scripts/reference/pbo-matrices.mjs /path/to/dir
#   docker run --rm -v /path/to/dir:/w r-base:latest bash -c \
#     'Rscript -e "install.packages(c(\"pbo\",\"jsonlite\"),repos=\"https://cloud.r-project.org\")" && Rscript /w/pbo-cran.R'
# with this script copied into that directory. The Sharpe metric uses the population standard
# deviation, as pboCscv does; s is the number of splits; threshold 0 gives PBO.
suppressMessages(library(pbo))
sharpe <- function(x) apply(as.matrix(x), 2, function(col) { mu <- mean(col); sdv <- sqrt(mean((col - mu)^2)); if (sdv > 0) mu / sdv else -Inf })
cases <- list(c("noise_160x10_s8", 8), c("skill_240x12_s8", 8), c("noise_320x20_s16", 16))
out <- list()
for (cs in cases) {
  m <- as.data.frame(as.matrix(read.csv(file.path("/w", paste0(cs[1], ".csv")), header = FALSE)))
  r <- pbo(m, s = as.integer(cs[2]), f = sharpe, threshold = 0)
  out[[cs[1]]] <- list(pbo = r$phi, lambdas = as.numeric(r$lambda))
  cat(cs[1], "R pbo", format(r$phi, digits = 17), "n", length(r$lambda), "\n")
}
writeLines(jsonlite::toJSON(out, digits = NA, auto_unbox = TRUE), "/w/ref.json")
