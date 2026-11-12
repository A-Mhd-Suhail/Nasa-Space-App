"""Optional, assumption-driven RF link margin for a direct-to-Earth link (NOT a mission link analysis).

    FSPL(dB)  = 20 log10(4 pi d f / c)                         free-space path loss
    C/N0      = EIRP - FSPL - L_other + G/T - k                (dB-Hz;  k = -228.6 dBW/K/Hz)
    Eb/N0     = C/N0 - 10 log10(R_bps)
    margin    = Eb/N0 - Eb/N0_required

Every input is supplied by the user; there are NO defaults presented as real mission values. Not modelled: antenna
pointing loss and patterns (fold into L_other), Earth-side ground-station availability or DSN scheduling, atmosphere
and weather at the ground station, terrain reflection/multipath, polarisation, coding details beyond the required Eb/N0.
Geometric line of sight (Earth above the terrain horizon) is a necessary condition, not a sufficient one.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

C_M_S = 299_792_458.0
BOLTZMANN_DBW_K_HZ = -228.6  # 10 log10(1.380649e-23)


@dataclass(frozen=True)
class LinkAssumptions:
    frequency_hz: float
    eirp_dbw: float  # transmit power (dBW) + transmit antenna gain (dBi) - transmit-side losses
    receiver_g_over_t_db_k: float  # ground-station figure of merit
    data_rate_bps: float
    required_eb_n0_db: float
    other_losses_db: float = 0.0  # pointing, polarisation, atmosphere, implementation: user-supplied

    def validate(self) -> list[str]:
        e = []
        if not (1e8 <= self.frequency_hz <= 1e11):
            e.append("frequency_hz must be between 100 MHz and 100 GHz")
        if not (-30 <= self.eirp_dbw <= 90):
            e.append("eirp_dbw must be between -30 and 90")
        if not (-50 <= self.receiver_g_over_t_db_k <= 80):
            e.append("receiver_g_over_t_db_k must be between -50 and 80")
        if not (1 <= self.data_rate_bps <= 1e10):
            e.append("data_rate_bps must be between 1 and 1e10")
        if not (-5 <= self.required_eb_n0_db <= 40):
            e.append("required_eb_n0_db must be between -5 and 40")
        if not (0 <= self.other_losses_db <= 60):
            e.append("other_losses_db must be between 0 and 60")
        return e


def fspl_db(distance_km: float, frequency_hz: float) -> float:
    return 20.0 * math.log10(4.0 * math.pi * distance_km * 1000.0 * frequency_hz / C_M_S)


def margin_db(a: LinkAssumptions, distance_km: float) -> float:
    cn0 = a.eirp_dbw - fspl_db(distance_km, a.frequency_hz) - a.other_losses_db + a.receiver_g_over_t_db_k - BOLTZMANN_DBW_K_HZ
    return cn0 - 10.0 * math.log10(a.data_rate_bps) - a.required_eb_n0_db
