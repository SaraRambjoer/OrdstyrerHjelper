# OrdstyrerHjelper
Denne løsningen gjør det enklere å være ordstyrer på små til mellomstore møter.

## Funksjonalitet

Løsningen lar deg tracke hvor mange ganger og hvor lenge personer på møter har snakket. Den støtter også å automatisk sette opp en passende rekkefølge på talere som har meldt seg.

Løsningen støtter å holde styr på replikker og innlegg.

Løsningen kan også brukes for å tracke talelengde opp mot en ønsket makslengde.

Automatiske foreslått talerekkefølge er valgfritt. Automatisk forslag av talerekkefølge baserer seg på en tilpasset EEVDF-algoritme. Den tar hensyn til: 
- Total taletid på møte så langt
- Forsøke å unngå for lange ventetider på personer som allerede har høy taletid
- Støtte for feministisk møtepraksis ved å vektlegge kvinner (og ikke-binære) med noe høyere prioritet.

Løsningen lar deg legge inn personer i møtet inkl. navn. All data om personer lagres kun lokalt i din nettleser i "local storage". Fordi løsningen kun bruker selvskrivet javascript og ingen uteliggende pakker, bør ikke noen andre applikasjoner få tilgang til det (dersom nettleseren virker som det skal). 