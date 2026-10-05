"""ui — PyQt5 UI pages for Kaya Dristi Vision (forest theme)."""
from __future__ import annotations

from .forest_theme  import FOREST_QSS, CLR
from .splash        import SplashPage
from .home          import HomePage
from .census_home   import CensusHomePage
from .amc_page      import AMCPage
from .processing    import ProcessingPage
from .dialogs       import ActivationDialog, KeyGenDialog

__all__ = [
    "FOREST_QSS", "CLR",
    "SplashPage",
    "HomePage",
    "CensusHomePage",
    "AMCPage",
    "ProcessingPage",
    "ActivationDialog",
    "KeyGenDialog",
]