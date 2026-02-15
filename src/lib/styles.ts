/**
 * NexBite Design System — inline CSS for server-rendered pages.
 *
 * This mirrors the tokens from nexbite-ds/ so that Luca's pages
 * share the same visual language as the other apps.
 * Font: IBM Plex Sans (loaded via Google Fonts <link>).
 */

/** Google Fonts <link> tags + favicon — drop into every <head>. */
export const fontLinks = `
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 616 592'%3E%3Crect width='616' height='592' rx='120' fill='%230a0e1a'/%3E%3Cpath fill='%23cbd5e1' d='M119.109314,268.061066 C119.065285,263.325195 119.021263,258.589325 119.420914,253.195648 C119.899323,242.687317 119.934067,232.836807 119.968811,222.986298 C120.800987,210.330612 123.749130,198.051819 130.022232,187.148956 C137.736633,173.741104 148.846756,163.252960 162.535645,155.775253 C177.100540,147.819016 192.593552,142.449768 209.242828,141.976746 C223.559692,141.570007 237.812744,141.039062 252.154831,144.617920 C273.670197,149.986786 292.434082,159.494934 306.836853,176.352234 C316.382935,187.525162 322.795990,200.502365 325.209320,215.330582 C328.161682,233.470703 328.493927,251.657272 324.792206,269.554535 C321.997345,283.067200 316.005096,295.484344 307.170441,306.479218 C294.397064,322.375885 278.384277,333.158325 259.423370,340.539703 C246.236389,345.673340 232.911880,349.025574 218.088699,349.945282 C200.892609,349.929962 184.498352,349.958618 168.104431,350.046082 C167.420395,350.049744 166.739273,350.602264 166.056793,350.899109 C162.329681,350.556122 158.602585,350.213165 154.038422,349.793182 C154.038422,351.846741 154.038651,353.429077 154.038406,355.011444 C154.033615,384.823303 154.195099,414.637177 153.832260,444.444702 C153.781830,448.587372 151.928940,453.235229 149.544754,456.712952 C144.536331,464.018555 138.879166,471.054535 128.118103,471.963043 C125.020271,471.874054 122.776718,471.874054 119.837013,471.874054 C119.837013,465.352509 119.837013,459.164246 119.932861,452.517456 C120.024239,392.235413 120.026398,332.411835 119.977417,272.588318 C119.976181,271.079010 119.411316,269.570129 119.109314,268.061066 M253.971176,172.347809 C253.971176,172.347809 253.941376,171.986420 253.598969,171.392090 C247.106262,169.616547 240.613556,167.840988 233.168472,166.047073 C218.891144,165.223083 204.959579,166.354431 191.542038,172.013748 C178.992920,177.306763 169.156067,185.260483 162.296524,197.236053 C155.526398,209.055542 154.530807,222.078064 154.226730,234.945572 C153.569427,262.760132 154.004089,290.600922 154.056473,318.430847 C154.059799,320.200897 154.378281,322.060120 155.004868,323.704620 C155.364395,324.648163 156.587418,325.819214 157.512360,325.904480 C166.426300,326.726410 175.360962,327.883972 184.286865,327.860779 C193.499634,327.836792 202.705093,326.545105 211.921204,325.917389 C226.588089,324.918365 240.394608,321.086945 253.262466,313.882812 C265.384796,307.096069 275.851776,298.262421 282.648987,286.206970 C290.479553,272.318756 293.654480,256.843506 293.995331,240.913971 C294.244324,229.278183 292.186462,217.849808 287.736237,207.188934 C283.770874,197.689529 278.586029,188.609863 269.772888,182.472061 C264.819977,179.022690 259.664764,175.863724 254.454681,172.587509 C254.454681,172.587509 254.325699,172.423904 253.971176,172.347809z'/%3E%3Cpath fill='%23cbd5e1' d='M247.005768,428.205750 C245.663971,432.868622 244.308578,437.527649 242.983002,442.195129 C239.518250,454.394775 240.070877,466.222809 244.934296,478.129791 C249.516235,489.347687 256.369904,498.545868 267.323792,503.460571 C282.841003,510.422821 298.886688,511.283508 314.993896,504.495453 C334.974365,496.075104 343.956146,480.233307 346.048920,459.536285 C346.112244,458.909943 346.499634,458.316376 346.825378,456.850159 C346.925110,369.104584 346.919556,282.216400 346.953857,195.328217 C346.966675,162.873291 347.072479,130.418396 347.272552,97.880379 C347.608673,97.485947 347.530823,97.236328 347.108276,96.817688 C347.040863,96.586952 346.934967,96.118011 346.934967,96.118011 C352.031250,96.264946 357.198944,95.925606 362.208771,96.661201 C372.281128,98.140129 376.801727,105.660172 379.592041,114.951706 C379.186401,116.400421 379.119385,117.229019 379.119141,118.057640 C379.088470,230.704987 379.062622,343.352325 379.036560,455.999664 C379.025726,459.180939 379.630737,462.515442 378.884674,465.513763 C376.916382,473.424469 375.341248,481.662933 371.835388,488.912964 C364.686096,503.697205 353.884613,515.056396 338.664917,522.570129 C330.317780,526.691040 321.879791,529.601074 312.975494,531.618164 C310.993317,532.067200 308.867554,531.882141 305.975769,531.907227 C297.026794,531.882385 288.909943,531.939392 280.793060,531.996399 C263.775665,531.467102 249.070343,524.935059 235.479263,515.063660 C224.521530,507.104919 216.921844,496.566956 212.257874,484.221466 C209.659729,477.344208 208.732895,469.649231 208.174332,462.238220 C207.570587,454.227539 207.129379,446.039703 209.496704,438.121826 C211.094040,432.779266 213.439209,427.993469 220.032684,426.452332 C228.009033,426.758850 235.322693,426.755768 242.631226,426.947937 C244.099426,426.986572 245.548096,427.767242 247.005768,428.205750z'/%3E%3Cpath fill='%23f97316' d='M451.963593,443.177002 C427.914856,434.455200 415.986237,414.103027 415.411621,390.220673 C415.879700,388.855652 416.004639,388.197388 416.004730,387.539093 C416.009796,343.116638 416.006287,298.694153 415.992889,254.271698 C415.992523,253.112198 415.916016,251.946091 415.729462,250.806900 C415.715668,250.722809 414.516388,250.832870 413.868225,250.852661 C407.555389,250.914581 401.241119,250.915848 394.930450,251.067291 C392.286621,251.130768 390.895081,250.344666 390.940308,247.418091 C391.047791,240.462433 390.974884,233.503983 390.974884,225.976379 C398.828156,225.976379 406.411438,225.976379 414.822754,225.743317 C415.768738,223.527054 415.985077,221.544083 415.989685,219.560608 C416.044830,195.762238 416.068634,171.963791 416.100586,148.165375 C423.181671,148.105972 430.273590,147.781509 437.340485,148.070023 C443.114441,148.305786 447.246063,151.330765 448.656128,157.684113 C448.513153,161.668213 448.821625,165.073669 448.853699,168.481705 C448.959290,179.704529 448.964783,190.928284 449.008728,202.151688 C449.008728,202.151688 449.018829,202.494049 448.685669,202.998260 C448.241241,210.084259 448.047852,216.666870 448.113068,223.246933 C448.122162,224.163544 449.404541,225.067535 450.097504,225.977371 C450.097504,225.977371 450.000458,226.004669 450.279724,226.258911 C452.192688,226.662979 453.826355,226.942062 455.460175,226.943237 C479.511414,226.960663 503.563660,227.053558 527.613037,226.837463 C532.549683,226.793106 536.576172,226.943451 537.072083,233.079651 C534.776001,242.831268 528.064575,247.819458 517.927246,250.029266 C495.311096,249.953568 473.549225,249.853638 451.787689,249.908157 C450.868378,249.910461 449.952667,251.347778 449.035278,252.116592 C449.035278,252.116592 449.013153,252.505493 448.684204,253.030884 C448.263367,253.874420 448.091248,254.192474 448.090942,254.510681 C448.049408,298.519501 448.005951,342.528381 448.068634,386.537048 C448.070312,387.715454 449.227966,388.892242 449.846558,390.069794 C449.799530,399.077423 452.542480,407.437195 458.681244,413.717041 C462.416504,417.538055 468.021759,420.735352 473.246277,421.684326 C494.007141,425.455200 513.889160,422.743622 531.867310,410.707336 C533.159851,409.842041 534.698181,409.344025 536.142822,408.665619 C540.565063,419.312500 524.453857,437.254242 507.092255,442.014038 C505.922485,442.365173 505.455780,442.728912 504.989075,443.092651 C504.989044,443.092651 505.002228,443.011047 504.625122,442.915222 C495.034790,443.915314 485.830841,445.767944 476.605591,445.881073 C468.403870,445.981598 460.178528,444.153717 451.963593,443.177002z'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;

/** Inline SVG of the pjt monogram logo — shared with NexBite. */
export const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 616 592" width="40" height="38">
<path fill="#475569" d="
M119.109314,268.061066
	C119.065285,263.325195 119.021263,258.589325 119.420914,253.195648
	C119.899323,242.687317 119.934067,232.836807 119.968811,222.986298
	C120.800987,210.330612 123.749130,198.051819 130.022232,187.148956
	C137.736633,173.741104 148.846756,163.252960 162.535645,155.775253
	C177.100540,147.819016 192.593552,142.449768 209.242828,141.976746
	C223.559692,141.570007 237.812744,141.039062 252.154831,144.617920
	C273.670197,149.986786 292.434082,159.494934 306.836853,176.352234
	C316.382935,187.525162 322.795990,200.502365 325.209320,215.330582
	C328.161682,233.470703 328.493927,251.657272 324.792206,269.554535
	C321.997345,283.067200 316.005096,295.484344 307.170441,306.479218
	C294.397064,322.375885 278.384277,333.158325 259.423370,340.539703
	C246.236389,345.673340 232.911880,349.025574 218.088699,349.945282
	C200.892609,349.929962 184.498352,349.958618 168.104431,350.046082
	C167.420395,350.049744 166.739273,350.602264 166.056793,350.899109
	C162.329681,350.556122 158.602585,350.213165 154.038422,349.793182
	C154.038422,351.846741 154.038651,353.429077 154.038406,355.011444
	C154.033615,384.823303 154.195099,414.637177 153.832260,444.444702
	C153.781830,448.587372 151.928940,453.235229 149.544754,456.712952
	C144.536331,464.018555 138.879166,471.054535 128.118103,471.963043
	C125.020271,471.874054 122.776718,471.874054 119.837013,471.874054
	C119.837013,465.352509 119.837013,459.164246 119.932861,452.517456
	C120.024239,392.235413 120.026398,332.411835 119.977417,272.588318
	C119.976181,271.079010 119.411316,269.570129 119.109314,268.061066
M253.971176,172.347809
	C253.971176,172.347809 253.941376,171.986420 253.598969,171.392090
	C247.106262,169.616547 240.613556,167.840988 233.168472,166.047073
	C218.891144,165.223083 204.959579,166.354431 191.542038,172.013748
	C178.992920,177.306763 169.156067,185.260483 162.296524,197.236053
	C155.526398,209.055542 154.530807,222.078064 154.226730,234.945572
	C153.569427,262.760132 154.004089,290.600922 154.056473,318.430847
	C154.059799,320.200897 154.378281,322.060120 155.004868,323.704620
	C155.364395,324.648163 156.587418,325.819214 157.512360,325.904480
	C166.426300,326.726410 175.360962,327.883972 184.286865,327.860779
	C193.499634,327.836792 202.705093,326.545105 211.921204,325.917389
	C226.588089,324.918365 240.394608,321.086945 253.262466,313.882812
	C265.384796,307.096069 275.851776,298.262421 282.648987,286.206970
	C290.479553,272.318756 293.654480,256.843506 293.995331,240.913971
	C294.244324,229.278183 292.186462,217.849808 287.736237,207.188934
	C283.770874,197.689529 278.586029,188.609863 269.772888,182.472061
	C264.819977,179.022690 259.664764,175.863724 254.454681,172.587509
	C254.454681,172.587509 254.325699,172.423904 253.971176,172.347809
z"/>
<path fill="#475569" d="
M247.005768,428.205750
	C245.663971,432.868622 244.308578,437.527649 242.983002,442.195129
	C239.518250,454.394775 240.070877,466.222809 244.934296,478.129791
	C249.516235,489.347687 256.369904,498.545868 267.323792,503.460571
	C282.841003,510.422821 298.886688,511.283508 314.993896,504.495453
	C334.974365,496.075104 343.956146,480.233307 346.048920,459.536285
	C346.112244,458.909943 346.499634,458.316376 346.825378,456.850159
	C346.925110,369.104584 346.919556,282.216400 346.953857,195.328217
	C346.966675,162.873291 347.072479,130.418396 347.272552,97.880379
	C347.608673,97.485947 347.530823,97.236328 347.108276,96.817688
	C347.040863,96.586952 346.934967,96.118011 346.934967,96.118011
	C352.031250,96.264946 357.198944,95.925606 362.208771,96.661201
	C372.281128,98.140129 376.801727,105.660172 379.592041,114.951706
	C379.186401,116.400421 379.119385,117.229019 379.119141,118.057640
	C379.088470,230.704987 379.062622,343.352325 379.036560,455.999664
	C379.025726,459.180939 379.630737,462.515442 378.884674,465.513763
	C376.916382,473.424469 375.341248,481.662933 371.835388,488.912964
	C364.686096,503.697205 353.884613,515.056396 338.664917,522.570129
	C330.317780,526.691040 321.879791,529.601074 312.975494,531.618164
	C310.993317,532.067200 308.867554,531.882141 305.975769,531.907227
	C297.026794,531.882385 288.909943,531.939392 280.793060,531.996399
	C263.775665,531.467102 249.070343,524.935059 235.479263,515.063660
	C224.521530,507.104919 216.921844,496.566956 212.257874,484.221466
	C209.659729,477.344208 208.732895,469.649231 208.174332,462.238220
	C207.570587,454.227539 207.129379,446.039703 209.496704,438.121826
	C211.094040,432.779266 213.439209,427.993469 220.032684,426.452332
	C228.009033,426.758850 235.322693,426.755768 242.631226,426.947937
	C244.099426,426.986572 245.548096,427.767242 247.005768,428.205750
z"/>
<path fill="#f97316" d="
M451.963593,443.177002
	C427.914856,434.455200 415.986237,414.103027 415.411621,390.220673
	C415.879700,388.855652 416.004639,388.197388 416.004730,387.539093
	C416.009796,343.116638 416.006287,298.694153 415.992889,254.271698
	C415.992523,253.112198 415.916016,251.946091 415.729462,250.806900
	C415.715668,250.722809 414.516388,250.832870 413.868225,250.852661
	C407.555389,250.914581 401.241119,250.915848 394.930450,251.067291
	C392.286621,251.130768 390.895081,250.344666 390.940308,247.418091
	C391.047791,240.462433 390.974884,233.503983 390.974884,225.976379
	C398.828156,225.976379 406.411438,225.976379 414.822754,225.743317
	C415.768738,223.527054 415.985077,221.544083 415.989685,219.560608
	C416.044830,195.762238 416.068634,171.963791 416.100586,148.165375
	C423.181671,148.105972 430.273590,147.781509 437.340485,148.070023
	C443.114441,148.305786 447.246063,151.330765 448.656128,157.684113
	C448.513153,161.668213 448.821625,165.073669 448.853699,168.481705
	C448.959290,179.704529 448.964783,190.928284 449.008728,202.151688
	C449.008728,202.151688 449.018829,202.494049 448.685669,202.998260
	C448.241241,210.084259 448.047852,216.666870 448.113068,223.246933
	C448.122162,224.163544 449.404541,225.067535 450.097504,225.977371
	C450.097504,225.977371 450.000458,226.004669 450.279724,226.258911
	C452.192688,226.662979 453.826355,226.942062 455.460175,226.943237
	C479.511414,226.960663 503.563660,227.053558 527.613037,226.837463
	C532.549683,226.793106 536.576172,226.943451 537.072083,233.079651
	C534.776001,242.831268 528.064575,247.819458 517.927246,250.029266
	C495.311096,249.953568 473.549225,249.853638 451.787689,249.908157
	C450.868378,249.910461 449.952667,251.347778 449.035278,252.116592
	C449.035278,252.116592 449.013153,252.505493 448.684204,253.030884
	C448.263367,253.874420 448.091248,254.192474 448.090942,254.510681
	C448.049408,298.519501 448.005951,342.528381 448.068634,386.537048
	C448.070312,387.715454 449.227966,388.892242 449.846558,390.069794
	C449.799530,399.077423 452.542480,407.437195 458.681244,413.717041
	C462.416504,417.538055 468.021759,420.735352 473.246277,421.684326
	C494.007141,425.455200 513.889160,422.743622 531.867310,410.707336
	C533.159851,409.842041 534.698181,409.344025 536.142822,408.665619
	C540.565063,419.312500 524.453857,437.254242 507.092255,442.014038
	C505.922485,442.365173 505.455780,442.728912 504.989075,443.092651
	C504.989044,443.092651 505.002228,443.011047 504.625122,442.915222
	C495.034790,443.915314 485.830841,445.767944 476.605591,445.881073
	C468.403870,445.981598 460.178528,444.153717 451.963593,443.177002
z"/>
</svg>`;

/** Shared reset + tokens + base component styles. */
export const baseStyles = `
  /* ── Reset ─────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; font-family: inherit; font-size: inherit; border: none; background: none; }
  input, textarea, select { font-family: inherit; font-size: inherit; }

  /* ── Tokens ────────────────────────────────────── */
  :root {
    --nxb-color-bg: #f8fafc;
    --nxb-color-surface: #ffffff;
    --nxb-color-surface-elevated: #ffffff;
    --nxb-color-border: #e2e8f0;
    --nxb-color-border-light: #cbd5e1;
    --nxb-color-text: #0f172a;
    --nxb-color-text-secondary: #64748b;
    --nxb-color-text-muted: #94a3b8;
    --nxb-color-primary: #475569;
    --nxb-color-primary-hover: #334155;
    --nxb-color-primary-ring: rgba(71, 85, 105, 0.1);
    --nxb-color-primary-ghost: rgba(71, 85, 105, 0.06);
    --nxb-color-accent: #f97316;
    --nxb-color-success: #059669;
    --nxb-color-danger: #ef4444;
    --nxb-radius-sm: 4px;
    --nxb-radius-md: 6px;
    --nxb-radius-lg: 10px;
    --nxb-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
    --nxb-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
    --nxb-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
    --nxb-transition-fast: 150ms ease;
  }

  /* ── Base ───────────────────────────────────────── */
  body {
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ── Typography ────────────────────────────────── */
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
  h2 { font-size: 1.1rem; font-weight: 600; letter-spacing: -0.01em; margin: 2rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--nxb-color-border); }
  .text-sm { font-size: 0.875rem; }
  .text-muted { color: var(--nxb-color-text-muted); }
  .italic { font-style: italic; }

  /* ── Layout ────────────────────────────────────── */
  .container { max-width: 640px; margin: 0 auto; padding: 2rem; }

  /* ── Card ──────────────────────────────────────── */
  .card {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-lg);
    padding: 1rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--nxb-color-border);
  }
  .card-header { display: flex; flex-direction: column; gap: 0.25rem; }
  .card-header-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .card-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .card-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-md);
    border: 1px solid var(--nxb-color-border);
    margin-bottom: 0.5rem;
    overflow: hidden;
    min-width: 0;
  }
  .card-row > div:first-child { min-width: 0; flex: 1; overflow: hidden; }
  .card-row .text-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Badge ─────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 0.5rem;
    background: var(--nxb-color-border);
    color: var(--nxb-color-text-secondary);
  }
  .badge.default { background: #dbeafe; color: #1d4ed8; }
  .badge.online { background: #f3e8ff; color: #7c3aed; }
  .badge.in-person { background: #fef3c7; color: #92400e; }

  /* ── Buttons ───────────────────────────────────── */
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--nxb-radius-md);
    font-weight: 500;
    font-size: 0.875rem;
    transition: background var(--nxb-transition-fast), color var(--nxb-transition-fast);
  }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: var(--nxb-color-primary); color: white; }
  .btn-primary:hover { background: var(--nxb-color-primary-hover); }
  .btn-secondary { background: var(--nxb-color-border); color: var(--nxb-color-text); }
  .btn-secondary:hover { background: var(--nxb-color-border-light); }
  .btn-danger { background: none; color: var(--nxb-color-danger); border: none; cursor: pointer; font-size: 0.8rem; }
  .btn-danger:hover { text-decoration: underline; }
  .btn-sm { padding: 0.25rem 0.75rem; font-size: 0.8rem; }
  .btn-ghost { background: transparent; color: var(--nxb-color-primary); border: 1px solid var(--nxb-color-border); }
  .btn-ghost:hover { background: var(--nxb-color-primary-ghost); border-color: var(--nxb-color-primary); }

  /* ── Forms ─────────────────────────────────────── */
  .form-group { margin-bottom: 0.75rem; }
  .form-group label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem; color: var(--nxb-color-text-secondary); }
  .form-group input, .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    font-size: 0.875rem;
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text);
    transition: border-color var(--nxb-transition-fast);
  }
  .form-group input:focus, .form-group select:focus {
    outline: none;
    border-color: var(--nxb-color-primary);
    background: var(--nxb-color-surface);
    box-shadow: 0 0 0 3px var(--nxb-color-primary-ring);
  }
  .form-row { display: flex; gap: 0.75rem; }
  .form-row > * { flex: 1; }

  /* ── Modal ─────────────────────────────────────── */
  .modal {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    z-index: 1000;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }
  .modal.active { display: flex; }
  .modal-content {
    background: var(--nxb-color-surface);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-lg);
    box-shadow: var(--nxb-shadow-lg);
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header {
    padding: 18px 22px;
    border-bottom: 1px solid var(--nxb-color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-title {
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .modal-close {
    width: 26px; height: 26px;
    border-radius: var(--nxb-radius-sm);
    font-size: 1.1rem;
    color: var(--nxb-color-text-secondary);
    display: flex; align-items: center; justify-content: center;
  }
  .modal-close:hover { background: var(--nxb-color-border); color: var(--nxb-color-text); }
  .modal-body { padding: 22px; }
  .modal-footer {
    padding: 14px 22px;
    border-top: 1px solid var(--nxb-color-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @media (max-width: 768px) {
    .modal-content {
      max-width: none;
      margin: 0;
      border-radius: var(--nxb-radius-lg) var(--nxb-radius-lg) 0 0;
      max-height: 85vh;
      position: fixed;
      bottom: 0; left: 0; right: 0;
    }
    .modal { align-items: flex-end; padding: 0; }
  }

  /* ── Toggle ────────────────────────────────────── */
  .toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .toggle input { width: 1rem; height: 1rem; accent-color: var(--nxb-color-primary); }
  .toggle-label { font-size: 0.8rem; color: var(--nxb-color-text-secondary); }

  /* ── Toast ─────────────────────────────────────── */
  #toast {
    display: none;
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--nxb-color-primary);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: var(--nxb-radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    z-index: 100;
    box-shadow: var(--nxb-shadow-md);
  }
  #toast.show { display: block; }

  /* ── Misc ──────────────────────────────────────── */
  .powered-by { text-align: center; margin-top: 3rem; color: var(--nxb-color-text-muted); font-size: 0.8rem; }
  .section-title { font-size: 0.8rem; font-weight: 600; color: var(--nxb-color-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin: 0.75rem 0 0.5rem; }
  .user-info { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; font-size: 0.875rem; }
  a { color: var(--nxb-color-primary); text-decoration: none; }
  a:hover { text-decoration: underline; }

  @media (max-width: 768px) {
    .form-group input, .form-group select, .form-group textarea { font-size: 16px; }
  }`;

/** Shared app header/nav styles. */
export const headerStyles = `
  .app-header {
    background: var(--nxb-color-surface);
    border-bottom: 1px solid var(--nxb-color-border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .app-header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--nxb-color-text);
  }
  .app-header-brand:hover { text-decoration: none; }
  .app-header-wordmark {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--nxb-color-text);
  }
  .app-header-nav {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .app-header-user {
    font-size: 0.8rem;
    color: var(--nxb-color-text-secondary);
  }
`;

/** Settings-specific styles (availability, locations, etc.) */
export const settingsStyles = `
  .day-label { font-weight: 500; min-width: 100px; flex-shrink: 0; }
  .avail-row { flex-wrap: wrap; gap: 0.5rem; }
  .avail-slots { flex: 1; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .avail-slot {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
    padding: 0.125rem 0.5rem; border-radius: 1rem;
    font-size: 0.8rem; font-weight: 500;
  }
  .btn-inline-delete { background: none; border: none; color: var(--nxb-color-text-muted); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.125rem; }
  .btn-inline-delete:hover { color: var(--nxb-color-danger); }
  .locations-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--nxb-color-border); }
  .location-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; margin-bottom: 0.25rem; border-radius: var(--nxb-radius-sm); }
  .location-row:hover { background: var(--nxb-color-bg); }
  .pac-container { z-index: 10000 !important; border-radius: var(--nxb-radius-md); border: 1px solid var(--nxb-color-border); box-shadow: var(--nxb-shadow-md); font-family: 'IBM Plex Sans', -apple-system, sans-serif; }
  .pac-item { padding: 0.5rem 0.75rem; font-size: 0.875rem; cursor: pointer; }
  .pac-item:hover { background: var(--nxb-color-bg); }
  .pac-item-selected { background: #eff6ff; }
  .pac-icon { display: none; }
  .pac-item-query { font-weight: 600; font-size: 0.875rem; }
  .autocomplete-hint { font-size: 0.75rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }`;

/** Meeting picker page styles. */
export const meetingStyles = `
  .subtitle { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; }
  .status {
    display: inline-block; padding: 0.25rem 0.75rem;
    border-radius: 1rem; font-size: 0.875rem; font-weight: 500; margin-bottom: 1.5rem;
  }
  .status.proposed { background: #fef3c7; color: #92400e; }
  .status.confirmed { background: #d1fae5; color: #065f46; }
  .status.cancelled { background: #fee2e2; color: #991b1b; }
  .section-label { font-weight: 600; font-size: 0.9rem; color: var(--nxb-color-text-secondary); margin: 1.5rem 0 0.75rem; }
  .slot-card {
    display: block; width: 100%; padding: 1rem; margin-bottom: 0.75rem;
    border: 2px solid var(--nxb-color-border); border-radius: var(--nxb-radius-lg);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast);
  }
  .slot-card:hover:not(:disabled) { border-color: var(--nxb-color-primary); }
  .slot-card:disabled { opacity: 0.7; cursor: default; }
  .slot-card.selected { border-color: var(--nxb-color-success); background: #ecfdf5; }
  .slot-card.active { border-color: var(--nxb-color-primary); background: #f1f5f9; }
  .slot-date { font-weight: 600; margin-bottom: 0.25rem; }
  .slot-time { color: var(--nxb-color-text-secondary); }
  .slot-confirmed { color: var(--nxb-color-success); font-weight: 600; margin-top: 0.25rem; }
  .location-card {
    display: block; width: 100%; padding: 0.875rem; margin-bottom: 0.5rem;
    border: 2px solid var(--nxb-color-border); border-radius: var(--nxb-radius-lg);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast);
  }
  .location-card:hover:not(:disabled) { border-color: var(--nxb-color-accent); }
  .location-card:disabled { opacity: 0.7; cursor: default; }
  .location-card.active { border-color: var(--nxb-color-accent); background: #fff7ed; }
  .location-name { font-weight: 600; }
  .location-address { color: var(--nxb-color-text-secondary); font-size: 0.875rem; margin-top: 0.125rem; }
  .location-notes { color: var(--nxb-color-text-muted); font-size: 0.8rem; font-style: italic; margin-top: 0.125rem; }
  .none-work {
    display: block; width: 100%; padding: 0.75rem; margin-top: 1rem;
    border: none; background: none; color: var(--nxb-color-primary);
    cursor: pointer; font-size: 0.9rem;
  }
  .none-work:hover { text-decoration: underline; }
  #message { margin-top: 1rem; padding: 1rem; border-radius: var(--nxb-radius-md); display: none; }
  #message.success { display: block; background: #d1fae5; color: #065f46; }
  #message.error { display: block; background: #fee2e2; color: #991b1b; }`;

/** Landing/Join page styles. */
export const landingStyles = `
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .container { text-align: center; max-width: 480px; padding: 40px 24px; }
  .landing-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .landing-wordmark {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--nxb-color-text);
  }
  .tagline { font-size: 1.05rem; color: var(--nxb-color-text-secondary); margin-bottom: 32px; }
  .subtitle { text-align: center; color: var(--nxb-color-text-secondary); font-size: 0.95rem; margin-bottom: 32px; }
  .how-it-works {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-lg);
    border: 1px solid var(--nxb-color-border);
    padding: 24px;
    text-align: left;
    margin-bottom: 24px;
  }
  .how-it-works h2 {
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--nxb-color-text-muted); margin-bottom: 16px; border: none; padding: 0;
  }
  .step { display: flex; gap: 12px; margin-bottom: 14px; }
  .step:last-child { margin-bottom: 0; }
  .step-num {
    flex-shrink: 0; width: 24px; height: 24px;
    background: var(--nxb-color-primary); color: white;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 600;
  }
  .step p { font-size: 0.95rem; line-height: 1.55; color: var(--nxb-color-text); }
  .cta-btn {
    display: inline-block; padding: 12px 28px;
    background: var(--nxb-color-primary); color: white;
    border-radius: var(--nxb-radius-md); font-size: 0.95rem; font-weight: 600;
    text-decoration: none; margin-bottom: 16px;
    transition: background var(--nxb-transition-fast);
  }
  .cta-btn:hover { background: var(--nxb-color-primary-hover); text-decoration: none; }
  .email-badge {
    display: inline-block; background: var(--nxb-color-bg);
    border: 1px solid var(--nxb-color-border);
    color: var(--nxb-color-primary); padding: 8px 16px;
    border-radius: var(--nxb-radius-md); font-size: 0.95rem; font-weight: 500; font-family: monospace;
  }
  .note { text-align: center; font-size: 0.85rem; color: var(--nxb-color-text-muted); margin-top: 16px; }
  .error {
    background: #fee2e2; color: #dc2626;
    padding: 10px 12px; border-radius: var(--nxb-radius-md);
    font-size: 0.875rem; margin-bottom: 16px; display: none;
  }`;

/** Join page form card styles — extends landingStyles. */
export const joinStyles = `
  .container { max-width: 420px; }
  .card label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 6px; }
  .card input, .card select {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md); font-size: 0.95rem;
    margin-bottom: 16px; transition: border-color var(--nxb-transition-fast);
    background: var(--nxb-color-bg); color: var(--nxb-color-text);
  }
  .card input:focus, .card select:focus {
    outline: none; border-color: var(--nxb-color-primary);
    box-shadow: 0 0 0 3px var(--nxb-color-primary-ring);
    background: var(--nxb-color-surface);
  }
  .card button[type="submit"] {
    width: 100%; padding: 12px;
    background: var(--nxb-color-primary); color: white;
    border: none; border-radius: var(--nxb-radius-md);
    font-size: 0.95rem; font-weight: 600;
    transition: background var(--nxb-transition-fast);
  }
  .card button[type="submit"]:hover { background: var(--nxb-color-primary-hover); }`;
