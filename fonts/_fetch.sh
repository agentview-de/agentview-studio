#!/usr/bin/env bash
# Best-effort self-host fetch for agentView Studio web fonts (DSGVO/GDPR).
# Pulls one woff2 per used weight from gwfh (Google Webfonts Helper) which
# proxies the Google Fonts files under the SIL Open Font License.
set -u
cd "$(dirname "$0")"

dl() { # url  outfile
  curl -fsSL "$1" -o "$2" && [ -s "$2" ] && echo "ok   $2" || { echo "FAIL $2"; rm -f "$2"; }
}

# Inter — 400,500,600,700,800
dl "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2" inter-400.woff2
dl "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2" inter-500.woff2
dl "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff2" inter-600.woff2
dl "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2" inter-700.woff2
dl "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYAZ9hiA.woff2" inter-800.woff2

# Inter Tight — 400,500,600,700,800,900
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjDw-aWy5S.woff2" inter-tight-400.woff2
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjPQ-aWy5S.woff2" inter-tight-500.woff2
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mj0QiaWy5S.woff2" inter-tight-600.woff2
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mj6AiaWy5S.woff2" inter-tight-700.woff2
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjjwiaWy5S.woff2" inter-tight-800.woff2
dl "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjpgiaWy5S.woff2" inter-tight-900.woff2

# JetBrains Mono — 400,500,600
dl "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOV.woff2" jetbrains-mono-400.woff2
dl "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxTOlOV.woff2" jetbrains-mono-500.woff2
dl "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8FqtTOlOV.woff2" jetbrains-mono-600.woff2

# Playfair Display — 400,600,800
dl "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtM.woff2" playfair-display-400.woff2
dl "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKebunDXbtM.woff2" playfair-display-600.woff2
dl "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKfFunDXbtM.woff2" playfair-display-800.woff2
