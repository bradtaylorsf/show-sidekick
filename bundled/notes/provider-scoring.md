# Provider Scoring

Show Sidekick v0.1 keeps tool routing intentionally simple:

1. Tool names listed in `prefs.prefer` win first, in list order.
2. Available tools beat unavailable tools.
3. Discovery order breaks remaining ties.

The known consequence is that Show Sidekick may choose a different provider for the same brief when multiple providers are technically valid.

This simplification is tracked from audit item C-47. Revisit the ranking model in v0.2 if real productions show provider drift that preference plus availability cannot explain.
