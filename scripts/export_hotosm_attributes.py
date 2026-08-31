"""Compatibility entry point for the corrected full-network web build.

The downloadable table, summary statistics and map geometry are regenerated
as one transaction so their classifications and totals cannot diverge.
"""

from build_corrected_vehicular_web import main


if __name__ == "__main__":
    main()
