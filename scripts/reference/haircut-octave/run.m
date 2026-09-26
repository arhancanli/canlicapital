pkg load statistics;
rand("seed", 1); randn("seed", 1);
cases = [3 120 1.0 1 1 0.1 100 0.4;
         3 240 0.8 1 0 0.0 10  0.2;
         3 594 0.43 1 0 0.0 10 0.2;
         3 60  2.0 1 1 0.2 50  0.4;
         3 360 0.5 1 0 0.0 1   0.2;
         3 1000 1.5 1 0 0.0 315 0.2];
for i = 1:rows(cases)
  c = cases(i,:);
  printf("=== CASE %d ===\n", i);
  Haircut_SR_precise(c(1), c(2), c(3), c(4), c(5), c(6), c(7), c(8));
end
