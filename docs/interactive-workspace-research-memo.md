# Interactive Workspace Research Memo — CAOS LDA HSI

Author: research pass for the Workspace redesign of the public web app at
`github.com/fsantibanezleal/caos-lda-hsi`.

Status: design / research memo. No code is proposed here.

Scope: the canonical reference for the redesign of the **Workspace** tab.
Synthesises the state of the art in interactive exploration of (a) topic
models and (b) hyperspectral data, plus the meta-patterns from
information-visualization research, and applies them to the precomputed
artifacts the project already ships (`real_samples.json`,
`local_core_benchmarks`, `hidsag_curated_subset`, `spectral_library_samples`,
`segmentation_baselines`, RGB / label PNGs).

The diagnosis driving this memo is that recent shipped attempts of the
Workspace look like static papers — cards, percentage tables, tooltips on
hover, prose section headers — instead of an analytical workspace. This
memo is meant to make the gap concrete and to give a developer a
defendable specification to work from.

A note on URLs: every claim that is not common knowledge is followed by a
URL in parentheses. Where a tool's interaction model is reported from
secondary documentation rather than verified hands-on, this is marked
"reportedly" or "uncertain". The original LDAvis paper PDF
(https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf)
was identified but only inspected through secondary descriptions in this
research pass.

---

## 1. Topic-modelling interactive exploration tools

The topic-model visualization community has converged on a small set of
well-tested interaction patterns. They are worth studying not just for
"what to put on screen" but for "what the user is allowed to *do*".

### 1.1 LDAvis / pyLDAvis (Sievert & Shirley, 2014)

This is the canonical reference for interactive topic exploration. The
R original is `LDAvis` (https://github.com/cpsievert/LDAvis); the Python
port is `pyLDAvis` (https://github.com/bmabey/pyLDAvis,
https://pyldavis.readthedocs.io/en/latest/readme.html). Both render an
HTML+D3 page with two coordinated panels.

Information architecture — two panels, side by side:

- **Left panel — intertopic distance map.** Topics rendered as circles in
  a 2D plane. Inter-topic distance is computed via Jensen-Shannon
  divergence between φ_k vectors and projected to 2D via PCA / MDS. Disc
  area encodes topic prevalence (marginal P(topic)) in the corpus
  (https://www.kennyshirley.com/LDAvis/,
  https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf,
  reported in https://siqi-zhu.medium.com/ldavis-a-deep-dive-into-the-popular-topic-modeling-tool-d0c61a03e969).
- **Right panel — top-terms bar chart.** Horizontal bars per term. Two
  overlaid bars per term: the term's overall frequency in the corpus
  (grey), and the term's frequency *within* the currently selected topic
  (red). The fact that you see *both* bars at once is the single most
  load-bearing visual idea in the tool — it visualises "is this term
  characteristic of the topic, or just frequent everywhere?" on every row
  (https://we1s.ucsb.edu/research/we1s-tools-and-software/topic-model-observatory/tmo-guide/tmo-guide-pyldavis/).

Concrete interactions:

- **Click a topic circle on the left** → the right-panel term bars
  refresh to show that topic's top-30 words ranked by relevance (default
  λ = 0.6). Selected circle gets a red outline; remaining circles dim
  (https://we1s.ucsb.edu/research/we1s-tools-and-software/topic-model-observatory/tmo-guide/tmo-guide-pyldavis/).
- **Move the λ slider** on top of the right panel from 1 (rank by
  in-topic probability — favours frequent terms) to 0 (rank by lift =
  P(w|topic) / P(w) — favours distinctive but maybe rare terms). The bar
  list re-ranks live; user testing in the original paper found λ ≈ 0.6
  optimal for interpretability (the "textbook example" of a
  parameter-as-slider)
  (https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf,
  https://we1s.ucsb.edu/research/we1s-tools-and-software/topic-model-observatory/tmo-guide/tmo-guide-pyldavis/).
- **Hover a term on the right** → the left panel re-renders: every
  topic circle is resized to the conditional probability P(topic | term).
  This is the inverse interaction of clicking a topic, and it answers
  "which topics is this word a member of, and how strongly?". This is
  the key bidirectional brushing in the tool
  (https://siqi-zhu.medium.com/ldavis-a-deep-dive-into-the-popular-topic-modeling-tool-d0c61a03e969).
- **Hover a topic circle** → topic stays selected and term bars stay
  fixed; the disc highlights as a target.

Data model behind it: P(topic), P(term|topic), P(term), P(topic|term), the
2D MDS projection, and a global vocabulary list ranked by saliency. The
saliency = P(w) · KL(P(t|w) || P(t)) measure introduced in Termite is
borrowed here as the relevance metric's λ=0 endpoint
(https://idl.uw.edu/papers/termite).

What works, what's reusable:

- The two-panel architecture (global structure ↔ local detail) is a
  near-universal pattern that translates directly to LDA-on-HSI: left
  panel becomes "intertopic map of HSI topics", right panel becomes
  "top spectral tokens for the selected topic + band profile".
- The λ slider is the prototype of a *parameter-as-slider* in scientific
  exploration. Re-rank top tokens of an HSI topic as λ slides.
- Bidirectional brushing (click-topic → see-words; hover-word →
  re-weight-topics) maps directly to: hover a band token → re-weight
  the topic map; click a topic → reveal its band profile.

What doesn't: the 2D MDS projection compresses high-dimensional topic
distance and is sometimes misread as a true geometric layout; pyLDAvis
documentation explicitly cautions about this
(https://www.objectorientedsubject.net/2018/08/experiments-on-topic-modeling-pyldavis/).
Also, pyLDAvis does not let you brush *documents* or *regions of the
corpus* — that is exactly the gap a Workspace for HSI needs to close
(documents in HSI = pixels / superpixels / scenes).

### 1.2 Termite (Chuang, Manning, Heer, Stanford, 2012)

Termite (http://vis.stanford.edu/papers/termite,
http://vis.stanford.edu/files/2012-Termite-AVI.pdf,
https://idl.uw.edu/papers/termite) is the term × topic *matrix* view.
Each cell is a circle whose area encodes P(term|topic). Rows are
seriated (Chuang's seriation algorithm) so semantically related terms
cluster vertically. Columns can be reordered to match a topic similarity
ordering.

Two key contributions used by the whole field afterwards:

- **Saliency** = P(w) · KL(P(t|w) || P(t)). This is the function pyLDAvis
  inherits as its λ=0 endpoint
  (https://idl.uw.edu/papers/termite).
- **Seriation by asymmetric similarity** of word co-occurrence. The
  vertical neighbouring of terms is itself information.

Reusable for HSI: the rows-as-bands × columns-as-topics matrix is a
natural form factor for LDA on hyperspectral. Each cell is the weight
of band-token w in topic k. Seriation by spectral similarity (rather
than by alphabetical order or by index) is the right default — it
exposes spectral structure directly in the rows.

### 1.3 TopicLens (Kim et al., IEEE TVCG 2017)

TopicLens (https://dl.acm.org/doi/abs/10.1109/TVCG.2016.2598445,
http://users.umiacs.umd.edu/~elm/projects/topiclens/topiclens.pdf,
https://ieeexplore.ieee.org/document/7539597/) is a "lens" interaction:
the user drags a circular lens over a document scatterplot, and a *new*
topic model is computed in real time on the documents under the lens,
plus a new 2D embedding. The semantics is "let me re-model only the
documents in this region".

Reusable for HSI: this is exactly the right interaction for letting a
user re-fit (or at least re-summarise / re-rank topics) on a *spatial
sub-region of a scene*. The Comparison and Inference steps of the
Workspace can offer a "lens" over the RGB/label preview that reports the
dominant topics within the lens, the most active band tokens within the
lens, and the most likely class label there.

### 1.4 Hierarchical topic visualization — TIARA, HierarchicalTopics, ArchiText

TIARA (theme-river based, temporal) and the family of hierarchical
topic visualizations are documented in the IEEE VAST/InfoVis literature
(https://ieeevis.org/year/2013/paper/vast/hierarchicaltopics-visually-exploring-large-text-collections-using-topic-hierar,
https://ieeexplore.ieee.org/document/7347675/,
https://faculty.cc.gatech.edu/~aendert3/resources/Kim2020ArchiText.pdf).
ArchiText (Kim et al., IEEE VIS 2020,
https://virtual.ieeevis.org/year/2020/paper_f-tvcg-2019030092.html)
renders each topic as an indented equal-width card whose height encodes
document count and whose body encodes the sorted weighted top-keywords
as bars; users can split, merge and re-anchor topics interactively.

Reusable for HSI: even when the topic structure is flat (k = 4..16, as
in the project's current artifacts), the *card-as-bar-stack* idiom from
ArchiText is a clean way to render a topic chip that simultaneously
shows top-words and weights, instead of a generic pill.

### 1.5 Embedded Topic Models (ETM, Dieng, Ruiz, Blei, 2020)

ETM (https://aclanthology.org/2020.tacl-1.29/,
https://www.cs.columbia.edu/~blei/papers/DiengRuizBlei2020a.pdf,
https://github.com/adjidieng/ETM) places topics and words in the same
embedding space (each is a vector). Visualisation derived from it tends
to use UMAP of the joint word+topic embedding so that topics can be read
as "centroids" of their nearest words on the same plane. Follow-up R
package documentation
(https://cran.r-project.org/web/packages/topicmodels.etm/readme/README.html)
exposes this pattern.

Reusable for HSI: if the band tokens are eventually embedded (e.g. via
HIDSAG or any per-band representation learning), the ETM-style joint
plot of band-tokens and topics on the same UMAP becomes the right form
factor for the Topics step instead of an opaque MDS.

### 1.6 BERTopic (Grootendorst), 2020-2025

BERTopic
(https://maartengr.github.io/BERTopic/getting_started/visualization/visualize_topics.html,
https://maartengr.github.io/BERTopic/getting_started/visualization/visualization.html)
ships a Plotly-based intertopic distance map directly inspired by
LDAvis, plus topic-similarity heatmaps, hierarchical clustering view,
topics-over-time charts, and topic bar charts. As of recent versions it
adds LLM-based topic labelling and per-document drill-down, and recent
applications (e.g. October 2025, https://arxiv.org/html/2510.07557v1)
demonstrate its use on conversational corpora.

Reusable: Plotly's coordinated update model (figure registers selection
events, sibling figures listen and re-render) is a viable client
implementation strategy for an LDA+HSI Workspace.

### 1.7 topicwizard (Kardos, 2024-2025)

topicwizard (https://github.com/x-tabdeveloping/topicwizard,
https://x-tabdeveloping.github.io/topicwizard/,
https://arxiv.org/html/2505.13034v1) is the most modern model-agnostic
topic-model dashboard. Its information architecture is explicitly a
*set of perspectives*:

- topic-centric (intertopic map + topic word importance)
- word-centric (word importance across topics + word relations)
- document-centric (document position in topic space + topic mixture)
- group-centric (groups of documents on the topic map)

Each perspective is a separate page with its own coordinated panels.
This is a cleaner conceptual model than LDAvis's "everything in one
two-panel screen".

Reusable for HSI: the four perspectives map onto the natural objects of
LDA-on-HSI:

- topic-centric → "what is this topic in band-space and class-space?"
- word-centric → "what is this band-token, and which topics does it
  participate in?"
- document-centric → "what is this pixel/superpixel/scene, and what is
  its topic mixture?"
- group-centric → "what does this *class* (Alfalfa, Corn-notill, …)
  look like in topic space?"

### 1.8 jsLDA (Mimno)

jsLDA (https://mimno.infosci.cornell.edu/jsLDA/) runs LDA in the
browser on user-pasted text and exposes:

- live training (you watch topics update each Gibbs sweep),
- topic-correlation tab where correlated topic pairs are blue and
  anti-correlated pairs are red,
- per-topic top-word lists and document drill-down.

Reusable: the *correlation* view (signed topic-topic correlation matrix)
is rarely included in topic-model tools but is genuinely useful when k
is small; for the project's k ∈ {2,…,16} regime this is well-scoped.

### 1.9 TopicView (Crossno et al.)

TopicView (https://www.osti.gov/servlets/purl/1108535) is the dual-model
comparison tool: it compares two topic models on the same corpus via a
bipartite graph matching topics by cosine similarity, plus side-by-side
document-similarity graphs and term tables.

Reusable for HSI: this is exactly the form factor needed for the
Comparison step (LDA-with-recipe-A vs. LDA-with-recipe-B vs. SLIC-baseline,
all on the same scene).

### 1.10 Open-source reusable libraries

- **pyLDAvis** (Python; https://github.com/bmabey/pyLDAvis) — the
  reference implementation; output is a self-contained HTML+JS bundle.
- **topicwizard** (Python; https://github.com/x-tabdeveloping/topicwizard)
  — modern, model-agnostic, Dash-based.
- **BERTopic** visualizations (Python+Plotly; https://maartengr.github.io/BERTopic/).
- **Vitessce** (web; https://vitessce.io/docs/) — not topic-modelling
  per se, but its coordinated-views config model is the cleanest open
  template for "many linked panels, one JSON schema".
- **deck.gl** + **deck.gl-raster**
  (https://github.com/visgl/deck.gl,
  https://kylebarron.dev/deck.gl-raster/overview/) for GPU-accelerated
  interactive raster (HSI cubes can be served as Cloud-Optimized GeoTIFF
  and consumed band-by-band on the client).

---

## 2. Hyperspectral / spectral data interactive exploration

The HSI viewer space is much older than the topic-model viewer space and
has converged on a different set of interactions. The point of section 4
is to *combine* both.

### 2.1 ENVI / ENVI Web (NV5 Geospatial / L3Harris)

ENVI (https://www.nv5geospatialsoftware.com/Support/Maintenance-Detail/hyperspectral-analytics-in-envi-target-detection-and-spectral-mapping-methods,
tutorial: https://envi.geoscene.cn/help/Subsystems/envi/Content/Tutorials/Tools/HyperspectralAnalysisTutorial.htm)
is the industry standard. Concrete interactions documented:

- **Spectral Profile pick** — right-click on a pixel in the image
  display → Profile → Spectral; a chart window opens showing the full
  z-profile of that pixel; navigating with the cursor live-updates the
  profile (https://envi.geoscene.cn/help/Subsystems/envi/Content/Tutorials/Tools/HyperspectralAnalysisTutorial.htm).
- **Region of Interest (ROI)** — polygon / freehand / threshold tools
  to define one or more ROIs; ROIs become the unit of statistics, of
  spectral library entries, and of supervised training (https://www.glyfac.buffalo.edu/courses/gly560/Lessons/OLD/hyperspectral/assets/ENVI_Tut_12-13.pdf).
- **Band animation** — drag-select a contiguous band range and animate
  through them; hold Ctrl to multi-select non-contiguous bands.
- **RGB false-colour composer** — three drop-targets for R, G, B; user
  drags any band into any channel and the image re-renders.
- **Spectral Library Viewer** — overlay an arbitrary set of saved
  spectra on a chart, with class colour coding, used as the "ground
  truth" reference for SAM / SFF target detection
  (https://vis-webcontent.s3.amazonaws.com/tutorials/pdfs/WholePixelHyperspectralAnalysisTutorial.pdf).

Reusable: spectral-profile-on-click is non-negotiable. Drag-to-RGB
band assignment is a well-known and very direct interaction; copying
this idiom into the web app for false-colour previews is cheap.

### 2.2 QGIS + Semi-Automatic Classification Plugin (SCP)

SCP (https://plugins.qgis.org/plugins/SemiAutomaticClassificationPlugin/,
https://semiautomaticclassificationmanual.readthedocs.io/en/latest/introduction.html,
tutorial: https://semiautomaticclassificationmanual.readthedocs.io/en/latest/tutorial_1.html)
is the open-source standard for supervised land-cover. The hallmark
interaction is the **classification preview rectangle**: the user drags
a rectangle over the image, and a fresh supervised classification runs
*just inside that rectangle* using the current ROI / signature set,
immediately, before committing to a global classification.

Reusable: this is exactly TopicLens's lens interaction in spatial form,
and is the right primitive for the Inference step of the Workspace ("let
me see what the classifier would predict here, before I commit").

### 2.3 HyperSpy

HyperSpy (https://hyperspy.org/, viz docs:
https://hyperspy.org/hyperspy-doc/current/user_guide/visualisation.html)
is the Python ecosystem leader for n-dimensional spectral data,
particularly common in electron-microscopy spectrum-imaging. Concrete
interactions:

- `signal.plot()` opens **two linked figures**: a navigator (the
  spatial / index domain) and a signal (the spectrum at the navigator's
  current position). Moving the navigator's cursor live-updates the
  signal plot.
- `plot_spectra()` overlays an arbitrary list of spectra (e.g. all class
  means) on a single figure, with consistent colouring.

Reusable: the two-window pattern (navigator ↔ signal) is exactly the
mental model for "click pixel on RGB → spectrum on the right". HyperSpy's
explicit framing of "navigator + signal" is a useful thinking tool.

### 2.4 Spectral Python (SPy)

SPy (https://www.spectralpython.net/,
https://www.spectralpython.net/graphics.html) provides:

- `imshow` — a customised matplotlib display that responds to clicks
  with the spectrum of the pixel, and supports class-colour overlays.
- `view_cube` — an OpenGL 3D hypercube renderer, manipulable with
  mouse and keyboard.
- `view_nd` — N-D scatter where the user randomly cycles which 3 of N
  features are shown, to find informative projections.

Reusable: SPy's "cycle through random projections" is a low-cost way
to keep the user actively exploring instead of scrolling.

### 2.5 EnMAP-Box

EnMAP-Box (https://plugins.qgis.org/plugins/enmapboxplugin/,
https://enmap-box.readthedocs.io/en/latest/index.html,
https://www.enmap.org/data_tools/enmapbox/,
https://www.sciencedirect.com/science/article/pii/S2352711023002030) is
the QGIS plugin built around imaging spectroscopy. Concrete features
relevant here:

- **Spatially linked maps** — multiple raster views can be locked to
  share pan/zoom, so e.g. an RGB view, a label view, and a topic-loading
  view stay aligned.
- **Spectral Library Viewer** — first-class object: spectra are stored,
  visualised, filtered, exported as a library; this is the "documents
  pane" of imaging spectroscopy.
- **scikit-learn integration** — runs SVM / RF / clustering directly on
  the spectral library and writes results back into the QGIS layer
  ecosystem.

Reusable: the *idea* that spectral library entries are first-class
objects with their own panel, their own filter facets and their own
linked highlighting, rather than being buried inside a benchmark JSON.

### 2.6 Sentinel Hub EO Browser / Copernicus Browser

EO Browser (https://www.sentinel-hub.com/explore/eobrowser/,
https://apps.sentinel-hub.com/eo-browser/,
education: https://www.sentinel-hub.com/explore/education/custom-scripts-tutorial/,
2025 update: https://dataspace.copernicus.eu/news/2025-6-11-new-custom-scripts-available-copernicus-browser-and-sentinel-hub)
is the most-used web HSI/multispectral viewer.

Concrete interactions worth stealing:

- **Drag-and-drop band-to-RGB selector** — small numbered circles for
  each band drop into R/G/B slots. Hovering a band shows its central
  wavelength and bandwidth in a tooltip
  (https://medium.com/sentinel-hub/create-useful-and-beautiful-satellite-images-with-custom-scripts-8ef0e6a474c6).
- **Custom evalscript editor** — JavaScript snippet that maps bands to
  output pixels; live preview on save.
- **Index buttons** — single-click NDVI / NDWI / moisture index, etc.,
  each defined as an evalscript.
- **Time slider** with thumbnail strip across the bottom (irrelevant
  for the project's static cubes, but a generally good design).

Reusable: the band-circle drag-and-drop is the cleanest way to do RGB
composition without modal dialogs.

### 2.7 Google Earth Engine Code Editor / Apps

GEE Code Editor (https://developers.google.com/earth-engine/guides/playground,
https://earthengine.google.com/platform/) is the dominant
remote-sensing analytic IDE. Concrete patterns:

- **Inspector tab** — click anywhere on the map; the inspector lists
  all visible layer values at that pixel, plus computed expressions.
- **Layer Manager** — opacity sliders + visibility toggles per layer
  + per-layer percentile / std-dev stretch dialog.
- **Charts panel** — `ui.Chart.image.regions` and similar produce
  charts that respect the current filter and update when filters change.
- **Apps** (https://developers.google.com/earth-engine/guides/apps) —
  publishable single-page tools with widgets (sliders, checkboxes,
  dropdowns, draw tool) that can drive map and chart updates.

Reusable: the Inspector is the cleanest "click anywhere, get all
relevant numbers" pattern, and translates directly to "click a pixel,
get its band spectrum, its topic mixture, and its predicted class label".

### 2.8 Web-based HSI viewers

- **deck.gl-raster** (https://github.com/kylebarron/deck.gl-raster,
  https://kylebarron.dev/deck.gl-raster/overview/) is the
  closest-to-out-of-the-box client-side analytic raster engine. Backed
  by Cloud-Optimized GeoTIFF, it supports per-band channel mapping in
  GLSL and is what the `landsat8.earth` demo runs on.
- **leafmap** / **geemap** (https://leafmap.org/,
  https://geemap.org/get-started/) are Python packages that let
  Jupyter notebooks become interactive map dashboards; they use
  ipyleaflet under the hood. Useful as inspiration for the simple-but-
  rich "small widgets driving the map" pattern.
- **The Yorker hyperspectral historical-document viewer** (Kim et al.,
  IEEE VIS 2010, http://www.cse.yorku.ca/~mbrown/pdf/vis2010_kim.pdf)
  is an early academic web viewer that is interesting because it
  applies dimensional reduction interactively per ROI.

Reusable: deck.gl-raster is a credible target stack if the project
ever serves cubes directly to the client; for now the precomputed RGB
and label PNGs are sufficient.

---

## 3. Scientific data exploration UX patterns (the meta-patterns)

Each pattern is named, sourced, and grounded in how it would apply
specifically to LDA-on-HSI.

### 3.1 Brushing and linking (Becker & Cleveland, 1987)

Source: R. Becker, W. Cleveland, "Brushing scatterplots", *Technometrics*
29(2), 127-142, 1987 (https://www.tandfonline.com/doi/abs/10.1080/00401706.1987.10488204,
https://www.sci.utah.edu/~kpotter/Library/Papers/becker:1987:BS/index.html).
Selecting (brushing) a subset in one view causes the same subset to
highlight (link) in every other view.

LDA+HSI application: brushing a class chip in a class list highlights:
its mean spectrum on the spectral plot, its dominant topic on the
intertopic map, its pixels on the RGB+label preview, its row on the
class × topic matrix.

### 3.2 Focus + context (Furnas 1986; Spence & Apperley 1982)

Source: G. Furnas, "Generalized fisheye views"; reflections in Furnas
2006 (https://dl.acm.org/doi/10.1145/1124772.1124921). DOI(x|y) =
API(x) − D(x,y) defines per-element interest given a focus.

LDA+HSI application: when a topic is selected, its band-profile line
plot can render the *full* 200-band profile with the topic-distinctive
bands magnified, while non-distinctive bands stay visible but
de-emphasised — instead of cropping to a few bars.

### 3.3 Overview first, zoom and filter, details on demand (Shneiderman 1996)

Source: Shneiderman, "The eyes have it: a task by data type taxonomy
for information visualizations", IEEE VL 1996
(https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf,
https://infovis-wiki.net/wiki/Visual_Information-Seeking_Mantra).

LDA+HSI application: this is the entire navigation of the Workspace.
Overview = one-glance status of the dataset (how many pixels, how many
classes, how many topics, what claims are validated). Zoom = drilling
into one class or one topic. Filter = restricting to a class /
wavelength range / topic. Details on demand = clicking a single pixel
to see its full spectrum and topic mixture.

### 3.4 Coordinated multiple views (Roberts 2007)

Source: J. C. Roberts, "State of the art: coordinated and multiple
views in exploratory visualization", CMV 2007
(https://www.cs.kent.ac.uk/pubs/2007/2559/content.pdf,
https://www.sci.utah.edu/~kpotter/Library/Papers/roberts:2007:CMEV/index.html).
The architectural pattern: a shared selection state drives N independent
views, each rendering from its own model of the same selection.

LDA+HSI application: the Workspace has *one* selection state (active
subset / class / topic / pixel / lambda value) and every panel listens.
This is the architectural difference between a workspace and a report.

### 3.5 Direct manipulation (Shneiderman 1983)

Source: B. Shneiderman, "Direct manipulation: a step beyond programming
languages", IEEE Computer 16(8), 1983
(https://www.cs.umd.edu/~ben/papers/Shneiderman1983Direct.pdf,
https://dl.acm.org/doi/10.1109/MC.1983.1654471). Three principles:
(1) continuous representation of the objects of interest, (2) rapid,
incremental, reversible actions, (3) replacement of command syntax by
direct action on the objects.

LDA+HSI application: never make the user fill in a form to "select a
topic"; the topic chip is the topic, and clicking it is the action.
Never modal-dialog "configure RGB"; bands are draggable into R/G/B
slots. Never "submit" a wavelength range; the range slider re-renders
the spectral plot as it moves.

### 3.6 Selection chaining

This is not a single-paper pattern but a well-documented practice in
coordinated views (Boukhelifa, Roberts, Rodgers 2003 in CMV proceedings;
implemented widely in cellxgene, Vitessce, Tableau, Plotly's
`highlight_key`,
https://plotly-r.com/client-side-linking.html). Picking A populates a
B-list; picking a B populates a C-list; etc. The chain has a defined
order.

LDA+HSI application: pick a *dataset* → the *recipe* list filters to
recipes valid for that dataset → the *topic* list shows only models
trained with that recipe → picking a topic populates the *class
loadings* and the *band profile*.

### 3.7 Compare-by-clicking (TopicView; cellxgene's "split view")

Source: Crossno et al., TopicView
(https://www.osti.gov/servlets/purl/1108535); CELLxGENE Annotate's
side-by-side panes
(https://academic.oup.com/bioinformatics/article/37/23/4578/6318386).
Once an A is selected, clicking a B with a modifier (or via an
explicit "compare" affordance) puts A and B in a synchronised
side-by-side view rather than replacing A.

LDA+HSI application: click topic 2; then ⌘-click topic 5; the right
panel splits into "topic 2 spec | topic 5 spec | overlay diff". Same
for two recipes, two scenes, two classes.

### 3.8 Histogram-as-filter (cross-filter, Bostock; cellxgene)

Source: Mike Bostock's crossfilter (https://github.com/crossfilter/crossfilter),
adopted explicitly in cellxgene
(https://www.biorxiv.org/content/10.1101/2021.04.05.438318v1.full).
A histogram of a numeric variable doubles as its filter: drag a brush
on the histogram → the global selection restricts to that range; the
histogram itself dims the unselected bins.

LDA+HSI application: a histogram of "max-topic-loading per pixel" can
double as a filter — drag the brush from 0.7 to 1.0 and the RGB+label
preview restricts to highly-confident pixels. Same for "wavelength
range" or "topic-2 weight per class".

### 3.9 Range sliders for parameters (LDAvis λ; modern UIs)

Source: pyLDAvis λ slider
(https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf).

LDA+HSI application: λ slider for term ranking; k-slider where the
content of cards updates between precomputed k values; saliency-vs-
relevance toggle for top-words; threshold slider for "min topic loading
to count a pixel as belonging".

### 3.10 Other patterns with strong evidence in scientific exploration

- **Tooltips that expose the data, not prose** (Plotly, deck.gl
  conventions) — tooltip content is *data*: ID, value, units, related
  IDs. Not "this topic is interesting".
- **Linked colormap legend that doubles as a filter**
  (https://plotly-r.com/client-side-linking.html) — clicking a legend
  swatch toggles its inclusion; this is the most underused interaction
  in scientific dashboards.
- **Search-as-filter** — typing in a search box restricts the visible
  set live; topicwizard, cellxgene and EnMAP-Box's spectral library all
  use this.
- **Persistent breadcrumbs of the current selection** — the user always
  knows what they have selected. Stadia / Vitessce / cellxgene use a
  fixed top bar with selection chips that can be removed individually.

---

## 4. What an interactive LDA+HSI workspace needs (interaction inventory)

This section is the synthesis. Five steps (Data, Corpus, Topics,
Comparison, Inference, Validation), each with a concrete interaction
inventory that a developer can implement against the existing data
artifacts.

### 4.1 Data step

- **Primary objects**: the *interactive subset* (one row of
  `data/manifests/interactive_subsets.json`), the *scene cube* (RGB
  preview + label PNG), the *labelled class* (one of class_summaries),
  and the *pixel* (a single x,y).
- **Primary surface**: a two-pane navigator+signal layout (after
  HyperSpy, https://hyperspy.org/hyperspy-doc/current/user_guide/visualisation.html).
  Left = RGB preview (with label-overlay toggle and class chips).
  Right = spectral plot (mean spectrum of selected class, or full
  spectrum of clicked pixel).
- **Secondary views** that update on selection change: class-distribution
  histogram (counts per class), labelled-vs-unlabelled mask preview,
  metadata strip (cube shape, sensor, # bands, # labelled pixels).
- **Comparison primitives**:
  - Single: one class selected → its mean spectrum on the chart.
  - Two-way: ⌘-click a second class → both means overlay with a delta
    line at the bottom.
  - Side-by-side: pin two classes; an explicit panel shows
    "Class A | Class B | Δ" stacked vertically.
- **Drill-downs**: click a single pixel → spectrum of that pixel
  overlaid on the class mean, plus its class label and (x,y) shown in
  the inspector.
- **Sliders / parameters**:
  - Wavelength range slider (drag two handles; spectral chart re-zooms;
    the band-bar widgets in Corpus inherit the same range).
  - RGB band selector (three drag-targets; default fills with sensible
    visible-bands defaults from `approximate_wavelengths_nm`).
- **Filter / sort axes**: filter by class (multi-select); filter by
  "labelled / unlabelled / both"; sort classes by name / count / mean
  reflectance at λ.
- **Tooltip content per element**:
  - Class chip: `name · count · mean reflectance at peak band`.
  - Pixel: `x,y · class · max-topic id · max-topic weight`.
  - Spectrum point: `wavelength_nm · reflectance · band index`.

### 4.2 Corpus step

- **Primary objects**: the *recipe* (one of `corpus_recipes.json`), the
  *vocabulary* (the set of band-tokens like `0653nm`), the *document*
  (a pixel or a region depending on the recipe), the *band-token*.
- **Primary surface**: vocabulary heatmap — bands on x, frequency on
  y, with a band-spec strip on top showing the full wavelength axis
  and the recipe's selected sub-set highlighted (this is the
  EnMAP-Box-meets-Termite idea).
- **Secondary views**: document length histogram (per recipe, how many
  band-tokens does a document carry); per-class document-count chart;
  the actual vocabulary list (sortable by frequency / wavelength /
  topic-saliency).
- **Comparison primitives**:
  - Single: one recipe selected → its band-token list.
  - Two-way: pick recipe A and recipe B → vocabulary diff (A only, B
    only, both); document-length distribution overlay.
- **Drill-downs**: click a band-token → "this token is band index N at
  wavelength λ_N nm; appears in M documents; participates in topics
  {k1,k2,…}".
- **Sliders / parameters**: minimum document frequency slider;
  minimum/maximum band wavelength slider; quantisation level slider
  (if the recipe has one).
- **Filter / sort axes**: filter by absorption-band region (visible /
  red-edge / NIR / SWIR); sort vocabulary by frequency / saliency /
  wavelength.
- **Tooltip content**:
  - Band-token: `token · band index · wavelength_nm · doc-frequency · saliency`.
  - Recipe chip: `name · vocab size · mean doc length · supervision`.

### 4.3 Topics step

This is the LDAvis-equivalent and the heart of the Workspace.

- **Primary objects**: the *topic* (one element of `topics[]`), the
  *band-token* (top_words[]), the *class* (class_summaries[]), the
  *pixel* (when drill-down is needed).
- **Primary surface — three coordinated panels**:
  1. **Intertopic map** (left). Topics rendered as discs in a 2D
     plane, area = prevalence (mean of θ across the corpus). Default
     coordinates: PCA / MDS of pairwise JS-divergence between φ_k
     vectors (LDAvis convention,
     https://www.kennyshirley.com/LDAvis/). Selected topic gets red
     outline; ⌘-click adds to a compare set.
  2. **Top-words bar list** (centre). Bars per band-token with two
     overlaid bars: blue = P(token | topic_k), grey = P(token) global.
     Sorted by relevance with a **λ slider** at the top
     (LDAvis-faithful).
  3. **Topic profile plots** (right, stacked).
     a. *Band profile*: full 200-band line plot of `band_profile`,
        with the top-words' band positions highlighted.
     b. *Class loadings*: horizontal bar chart of mean θ_k per class
        (one bar per class), using the class colour palette.

- **Secondary views**: a small spatial preview panel showing the RGB
  with pixels coloured by max-topic id (a pseudo-segmentation), with
  the active topic outlined; topic-correlation heatmap (jsLDA-style).
- **Comparison primitives**:
  - Single: click topic k → all four panels update.
  - Two-way: ⌘-click topic k' → centre panel becomes "top-words of k
    | top-words of k' | symmetric-difference list"; band-profile panel
    overlays both lines plus a delta line at the bottom; class-loadings
    panel turns into delta bars (Δθ_k − θ_k' per class).
  - Side-by-side: an explicit "compare drawer" pin pair; the drawer
    persists across step changes.
- **Drill-downs**:
  - Hover a band-token in the centre panel → the intertopic map
    re-sizes every disc to P(topic | token) (LDAvis bidirectional
    brushing).
  - Click a band-token → highlight that band's vertical line on the
    band-profile panel.
  - Click a class loading bar → take the user to the Data step with
    that class pre-selected.
- **Sliders / parameters**:
  - λ slider (relevance ranking): 0..1, default 0.6.
  - "Top N words" slider: 5..30.
  - "Min loading per class" slider for the class-loadings panel.
- **Filter / sort axes**: filter band-tokens by wavelength range
  (inherited from Data step); sort top-words by raw probability,
  saliency, lift, or relevance.
- **Tooltip content**:
  - Topic disc: `topic id · prevalence · top 3 words · most-loaded class`.
  - Band-token row: `token · P(token|topic) · P(token) · lift · saliency`.
  - Class loading bar: `class name · mean θ_k · σ`.

### 4.4 Comparison step

- **Primary objects**: the *baseline* (SLIC, KMeans, GMM, SAM, NMF,
  raw, PCA — from `segmentation_baselines` and
  `local_core_benchmarks`), the *recipe* / *seed* combination, the
  *scene*.
- **Primary surface**: a stripped-down image-comparison strip — the
  RGB plus the active LDA pseudo-segmentation, the SLIC overlay, the
  KMeans/GMM cluster map, all aligned (spatially-linked, EnMAP-Box-
  style; https://enmap-box.readthedocs.io/en/latest/index.html). A
  toggle switches between side-by-side and stacked-with-opacity-slider.
- **Secondary views**: a small benchmark table (one row per method,
  columns = ARI / NMI / OA / κ if defined), driven by
  `local_core_benchmarks.json` via the subset-card decoupling layer.
- **Comparison primitives**:
  - Single: pick one method → its segmentation is on top; the table
    highlights its row.
  - Two-way: pick two methods → the strip splits, plus a "where do
    they disagree" mask layer.
- **Drill-downs**: click a disagreement region → list of pixels in
  that region; clicking one shows its spectrum and both methods'
  predictions.
- **Sliders / parameters**: opacity slider per layer; SLIC compactness
  slider where the underlying data has it precomputed; seed selector
  with arrows (`◀ seed 3 / 5 ▶`).
- **Filter / sort axes**: sort methods by metric; filter to "spatial
  / non-spatial"; filter to "supervised / unsupervised".
- **Tooltip content**:
  - Method row: `method · feature space · spatial use · supervision · OA · κ`.
  - Pixel under the disagreement layer:
    `x,y · method A pred · method B pred · ground truth (if labelled)`.

### 4.5 Inference step

- **Primary objects**: the *target variable*
  (label, biomass-like proxy, etc.), the *split* (train/test indices),
  the *baseline classifier*, the *region* (drawn or pre-existing).
- **Primary surface**: a map view of the scene with a **prediction
  preview rectangle** (after SCP,
  https://semiautomaticclassificationmanual.readthedocs.io/en/latest/tutorial_1.html):
  the user drags a rectangle, and the model's predictions inside that
  rectangle render immediately, before any global commit.
- **Secondary views**: confusion matrix (clickable cells), per-class
  precision/recall bars, ROC/PR curves where binary, calibration plot
  (uncertain — only if the data ships these).
- **Comparison primitives**:
  - Single: pick one classifier baseline → metrics + preview.
  - Two-way: pick two → side-by-side preview; confusion-difference
    matrix.
- **Drill-downs**: click a confusion-matrix cell → list of misclassified
  pixels; clicking a pixel reveals its spectrum, its topic mixture and
  both classifiers' decision values.
- **Sliders / parameters**: train/test ratio (if recomputable on the
  fly; otherwise selector across precomputed splits); decision
  threshold slider (binary case); top-K class-shown slider.
- **Filter / sort axes**: filter to "labelled-only"; sort classifiers
  by routed metric; filter classifiers by feature space.
- **Tooltip content**:
  - Confusion cell: `true class · pred class · n · % of true row`.
  - Preview pixel: `x,y · pred class · pred prob · spectrum link`.

### 4.6 Validation step

- **Primary objects**: the *block* (a Validation block in the project's
  six-block contract), the *claim*, the *sensitivity panel* (e.g. HIDSAG
  preprocessing sensitivity).
- **Primary surface**: a status board — one card per block with a
  status pill (validated / pending / not applicable) and an expansion
  arrow. The expansion is itself a small, scoped, interactive panel —
  e.g. preprocessing sensitivity opens a heatmap of metric vs.
  preprocessing flag.
- **Secondary views**: links into the relevant precomputed artifacts;
  a "what would change this status" hint per block.
- **Drill-downs**: click an expanded panel cell → take the user back to
  the relevant Workspace step with that configuration applied.
- **Tooltip content**: per pill, the rule that decides validation
  status, sourced from the manifest.

---

## 5. Reference layouts and screenshots

Five tools whose layout the redesign should emulate. For each: the URL,
the description, what makes the layout work, and what to steal.

### 5.1 LDAvis demo (Sievert / Shirley)

URL: https://www.kennyshirley.com/LDAvis/.

A canonical two-panel layout: left = intertopic distance map of 20
Newsgroups topics; right = horizontal-bar term-frequency view with a λ
slider on top. Selected topic is red-outlined; hovering a term resizes
the discs on the left.

What works: nothing on the page is decorative; every pixel is either
a selectable object or a coordinated reaction to a selection. The page
fits one screen with no scrolling, and the entire interaction model is
discoverable in 30 seconds.

What to steal: the two-panel form factor as the core of the Topics
step; the λ slider; the bidirectional brushing.

### 5.2 CZ CELLxGENE (Chan Zuckerberg Initiative)

URL: https://cellxgene.cziscience.com/, paper:
https://academic.oup.com/bioinformatics/article/37/23/4578/6318386,
biorxiv: https://www.biorxiv.org/content/10.1101/2021.04.05.438318v1.full.

Layout: one large UMAP/t-SNE in the centre; a left rail of
**categorical metadata** (cell type, donor, tissue) where each category
is its own collapsible panel listing values; a right rail of **gene
expression search**; a top bar with a persistent "current selection"
chip set; a "split view" toggle to put two embeddings side-by-side.

What works: the left rail is *the filter*; selecting any category value
is the act of filtering. Cross-filtering is automatic — picking a cell
type recolours and resizes the histograms in every other category. The
selection state is always visible and editable in the top chip bar.

What to steal: the left-rail categorical filter; the split-view
toggle; the chip bar for current selections; the histogram-as-filter
pattern.

### 5.3 UCSC Cell Browser

URL: https://cells.ucsc.edu/, paper:
https://academic.oup.com/bioinformatics/article/37/23/4578/6318386,
docs: https://cellbrowser.readthedocs.io/.

Layout: a fast WebGL scatter on the left, gene/metadata picker on the
right, dataset switcher in a top dropdown, and a "**split** the display
into two panes for side-by-side comparison" toggle.

What works: speed. The scatter pans/zooms instantly with a million
cells. The split-view feels native — it is one click, not a separate
"compare" mode.

What to steal: the side-by-side mode as a toggle on the existing view,
not a separate page; the speed budget (anything that takes more than
~150 ms per interaction breaks the workspace feeling).

### 5.4 Sentinel Hub EO Browser

URL: https://apps.sentinel-hub.com/eo-browser/, edu:
https://www.sentinel-hub.com/explore/education/custom-scripts-tutorial/.

Layout: a Leaflet-style map fills the canvas; left rail with date /
sensor / cloud-cover / index filters; right rail with the band-circle
drag-and-drop RGB composer and an evalscript editor; a footer with a
time/thumbnail strip.

What works: every filter has direct visual feedback on the map; the
band-to-RGB drag-and-drop is concrete and reversible; presets (NDVI,
NDWI, …) sit as one-click buttons next to the custom composer.

What to steal: the band-circle drag-and-drop for the Data step's
false-colour preview; the one-click index buttons (for the Workspace,
the equivalent is "show me topic-1-as-red, topic-2-as-green,
topic-3-as-blue").

### 5.5 Vitessce demo gallery

URL: https://vitessce.io/, docs: http://vitessce.io/docs/components/,
paper: https://www.nature.com/articles/s41592-024-02436-x.

Layout: arbitrary grid of coordinated views (scatterplot, spatial+image,
heatmap, genome browser tracks, statistical plots). The grid is
configured by a single JSON "view config" that names which views exist
and how their selections coordinate.

What works: the architectural separation between *views* and
*coordination scopes*; selection is not owned by a view, it is owned by
the page, and views subscribe.

What to steal: the page-level selection state pattern; the idea that a
new view (e.g. a topic-correlation heatmap) is a configuration change,
not a code change.

### 5.6 Honourable mentions

- **topicwizard** (https://x-tabdeveloping.github.io/topicwizard/) for
  its four-perspective navigation (topic / word / document / group).
- **EnMAP-Box** (https://enmap-box.readthedocs.io/en/latest/index.html)
  for spatially-linked maps and first-class spectral library panels.
- **Copernicus Interactive Climate Atlas / ERA Explorer**
  (https://climate.copernicus.eu/copernicus-interactive-climate-atlas-guide-powerful-new-c3s-tool,
  https://climate.copernicus.eu/era-explorer-app-global-climate-data-made-accessible-all)
  for left-control / centre-map / right-toolbar layouts that work on
  both desktop and laptop screens.
- **Google Earth Engine Code Editor**
  (https://developers.google.com/earth-engine/guides/playground) for
  the inspector pattern: click anywhere, see all relevant numbers in
  one place.

---

## 6. Anti-patterns

Documented and well-known mistakes that the recent shipped attempts
have all displayed. Each is paired with the canonical critique and a
concrete instantiation in the project.

### 6.1 "Hover-only interactivity" (the static-with-tooltip dashboard)

Critique: dashboards that look interactive but only have hover
tooltips on otherwise static charts are common-but-bad
(https://kevingee.biz/?p=144,
https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards).
The user cannot *change the question*, only *re-read the answer*.

Project instantiation: a topics card with a small bar chart and a
hover that shows percentages. To fix: clicking a bar must select the
band-token globally and propagate.

### 6.2 Long blog-style scroll with section headers

Critique: dashboards described in "Dashboard Design Patterns" (Sarikaya
et al., https://arxiv.org/pdf/2205.00757,
https://dashboarddesignpatterns.github.io/) note that a one-screen
layout where the user does not have to scroll is the strongest signal
of an analytical tool vs. a report.

Project instantiation: the Workspace tab cannot read like an article
with H2/H3 headings and full paragraphs. To fix: each step is one
fixed-height region with its own coordinated panels; explanatory text
is in inline tooltips and a slim status bar, not in flowing prose.

### 6.3 Card-of-cards layout

Critique: the "executive summary" pattern of N cards, each a
self-contained tile, has no cross-view linking. Selecting in one card
does not affect the others. This is the visual signature of a static
report
(https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards).

Project instantiation: a top row of "k=4 / k=6 / k=8 / k=10" topic
cards, each rendering its own static bar chart. To fix: a single k
selector at the top of the panel controls *one* topic chart that
re-renders, with side-by-side compare via pinning.

### 6.4 Tab-of-tabs with no cross-view linking

Critique: nested tabs that each load a separate dataset slice break
the coordinated-views principle (Roberts 2007,
https://www.cs.kent.ac.uk/pubs/2007/2559/content.pdf).

Project instantiation: Workspace already has step sub-tabs, which is
acceptable as long as the *selection state survives the tab change*.
What is not acceptable is a sub-tab that introduces its own selector
that the next sub-tab ignores. To fix: one global selection state at
the page level (active subset, active class, active topic, active
pixel, active recipe, active λ), serialised in the URL, propagated to
all step sub-tabs.

### 6.5 Numerical tables with percentages as the dominant content

Critique: tables of percentages encode the data but do not invite
exploration. Cleveland's exhortation "graphics first, numerics
second" applies (Cleveland 1993, *Visualizing Data*).

Project instantiation: a "class loadings" table with a column of
bolded percentages. To fix: replace with horizontal bars, one per
class, ordered by loading; numbers in tooltips.

### 6.6 Decorative pills / chips that don't act as selectors

Critique: pills that are styled as interactive but are non-clickable
violate Shneiderman's first DM principle, "continuous representation
of the objects of interest"
(https://www.cs.umd.edu/~ben/papers/Shneiderman1983Direct.pdf).

Project instantiation: a "supervision: weak" pill with no behaviour.
To fix: every pill is either a selector (clicking filters / drills
down) or it isn't styled like a button.

### 6.7 Reports presented as workspaces

Critique: workspaces have one selection state and a working set; reports
have one narrative path and a fixed conclusion. Mixing the two genres
produces the worst of both.

Project instantiation: a "Workspace" tab with embedded methodology
prose and citation footers. To fix: methodology stays in Overview;
citations stay in Landing; the Workspace is *only* for selecting and
seeing.

### 6.8 Sliders that only move integer-step "predefined" values when continuous would be cheap

Project-specific: a "k" slider that snaps between precomputed k values
is fine; a "λ" slider that snaps to {0, 0.5, 1} is not — λ is a
client-side reweighting and should be continuous.

---

## 7. Decision table for the redesign

Using the precomputed artifacts the project already ships (paths
relative to `data/derived/real/`, the `data/manifests/` directory, the
benchmark JSONs, and the PNG previews under `data/derived/real/previews/`).

### 7.1 Top 3-5 highest-leverage interactive surfaces (build first)

| # | Surface | Step | Data consumed | Interaction it offers |
|---|---|---|---|---|
| 1 | **Topics triptych** (intertopic map + top-words bars + topic profile panel) | Topics | `real_samples.json::scenes[].topics[]` (top_words, band_profile), `class_summaries[].mean_topic_mixture` | Click topic; ⌘-click for compare; hover word resizes discs; λ slider; click word selects band |
| 2 | **Class navigator + spectral chart** with class chips, mean-spectrum overlay, RGB+label preview | Data | `class_summaries[]` (mean_spectrum, count, name), `previews/*-rgb.png`, `previews/*-labels.png`, `approximate_wavelengths_nm` | Click class chip → mean spectrum + label-mask highlight; click pixel → spectrum overlay; ⌘-click to add a class to compare |
| 3 | **Recipe + vocabulary inspector** with band-position strip and document-length histogram | Corpus | `corpus_recipes.json`, `interactive_subsets.json`, vocabulary metadata in `real_samples.json` | Click recipe → vocab list + doc length; click band-token → position on band strip + topic memberships; pick A & B recipe to diff |
| 4 | **Spatial comparison strip** with linked pan/zoom across RGB / LDA pseudo-seg / SLIC / KMeans | Comparison | `segmentation_baselines.*` SLIC outputs, `local_core_benchmarks` metrics rows, label PNGs | Toggle layers; opacity slider; side-by-side mode; click pixel → method-by-method prediction |
| 5 | **Validation status board** with expandable per-block panels driven by the subset card | Validation | `interactive_subsets.json::validation_blocks`, the per-subset card from `data-pipeline/build_subset_cards.py`, `hidsag_curated_subset` for the sensitivity panel | Click block → expand interactive sub-panel; click sub-cell → jump to relevant Workspace step pre-selected |

### 7.2 Secondary surfaces (5-10) — second pass after the core works

| # | Surface | Step | Data consumed | Interaction |
|---|---|---|---|---|
| 6 | Inference preview lens (drag rectangle → predictions inside) | Inference | `local_core_benchmarks` classifier rows + label PNG | Drag rectangle; the predicted-class mask renders inside |
| 7 | Confusion matrix with clickable cells | Inference | classifier confusion arrays from benchmarks (uncertain — verify per-subset) | Click cell → list of misclassified pixels |
| 8 | Topic correlation heatmap (jsLDA-style) | Topics | derived from per-document θ; reportedly absent in real_samples but cheap to precompute | Click cell → load both topics into compare |
| 9 | Spectral library panel listing `spectral_library_samples` with per-library spectra overlay | Data | `spectral_library_samples` (spectrum + wavelengths) | Click library entry → overlays on spectrum chart; pin entries |
| 10 | HIDSAG curated-subset spectrum browser (per-cube spectra carousel) | Data / Validation | `hidsag_curated_subset` per-cube spectra | Cube selector; pixel-pick reveals spectrum; pin spectra |
| 11 | Topic mixture histogram per pixel (and as filter brush) | Topics | derived from per-pixel θ if exposed; otherwise per-class mean only | Brush histogram → restricts global pixel selection to confident range |
| 12 | Band-token list with seriation (Termite-style cell matrix) | Topics | top_words across all topics | Sort/seriate; click cell to drill |
| 13 | "Compare two recipes" overlay panel | Corpus | `corpus_recipes.json` + per-recipe vocab | Pin two recipes; vocab-diff list, doc-length overlay |
| 14 | Topics-as-RGB layer (max-3 topics → R/G/B) | Topics → Comparison | per-pixel θ (uncertain — depends on what is shipped) | Drag topic → R/G/B; result is a topic-mixture false-colour image |
| 15 | Sensitivity panel for HIDSAG preprocessing flags | Validation | the persistent-state HIDSAG sensitivity matrix | Click cell → re-renders relevant Topics state with that flag set |

### 7.3 What can be dropped (text-only fallbacks that should not exist in a workspace)

- Prose paragraphs in the Workspace tab itself. (They belong to
  Overview.)
- Static "topic interpretation" sentences ("Topic 2 corresponds to
  vegetation in the NIR…"). Replace with the band-profile chart and
  let the user read the spectrum.
- Tables of percentages dominating the screen (class loadings, topic
  prevalences). Replace with bar charts.
- Card grids of k = 4/6/8/10 each rendering their own copy of a chart.
  Replace with one chart and a k selector.
- Tooltip-only "interactivity" on the intertopic map. Replace with
  click-to-select propagation.
- Dataset-and-recipe selectors duplicated per sub-tab. Replace with a
  single page-level selection bar.
- Static "Methodology" paragraph at the top of Topics. Move to the
  inline tooltip on the step header or to Overview.

---

## 8. Concrete redesign proposal for the Workspace tab

This is the spec a developer should implement. It is consistent with
the existing six-tab top-level architecture documented in
`docs/functional-scope.md` and only redesigns the **Workspace** tab.

### 8.1 Top-level layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ persistent header (project, theme, language, GitHub, paper, ORCID)  │
├─────────────────────────────────────────────────────────────────────┤
│ Workspace selection bar (sticky, page-level state)                  │
│  [Subset ▾] [Recipe ▾] [k ▾] [Seed ◀ 3/5 ▶] [λ === slider]          │
│  selection chips: ▣ Class:Corn  ▣ Topic:2  ▣ Topic:5  ✕             │
├──────────┬───────────────────────────────────────┬──────────────────┤
│ Step rail│ Step content (one fixed-height region)│ Compare drawer   │
│  Data    │                                       │ (collapsible)    │
│  Corpus  │  ┌─────── panel 1 ───────┐            │  pinned topics   │
│ ▸Topics  │  │  intertopic map       │            │  pinned classes  │
│  Compare │  └───────────────────────┘            │  pinned recipes  │
│  Infer   │  ┌─── panel 2 ───┐ ┌── panel 3 ──┐    │  side-by-side    │
│  Validate│  │  top words    │ │  band prof  │    │                  │
│          │  │  (λ slider)   │ │  + classes  │    │                  │
│          │  └───────────────┘ └─────────────┘    │                  │
└──────────┴───────────────────────────────────────┴──────────────────┘
```

The selection bar is sticky, the step rail is sticky, the step content
panel is exactly one viewport tall, and the compare drawer slides in
from the right when there is a non-empty pin set.

### 8.2 State model

A single `WorkspaceSelection` object lives at the page level and is
URL-serialised. Fields:

- `subsetId: string` — drives the call to `/api/subset-cards/{id}`.
- `recipeId: string | null` — depends on subsetId.
- `k: number | null` — depends on what the subset card carries.
- `seed: number | null` — same.
- `lambda: number ∈ [0,1]` — default 0.6 (LDAvis convention).
- `topNWords: number` — default 12.
- `wavelengthRange: [nmMin, nmMax]` — initialised to full sensor range.
- `activeClassIds: number[]` — multi-select.
- `activeTopicIds: string[]` — multi-select; the first element is the
  "primary" selection, the rest go to the compare drawer.
- `activePixel: {x: number, y: number} | null`.
- `lensRect: {x0,y0,x1,y1} | null` — when the user is dragging in
  Inference.

State propagation rules:

- Changing `subsetId` resets `recipeId`, `k`, `seed`, `activeClassIds`,
  `activeTopicIds`, `activePixel`, `lensRect`. Keeps `lambda`,
  `topNWords`, `wavelengthRange` (these are display preferences).
- Changing `recipeId` resets `k`, `seed`, `activeTopicIds`,
  `activePixel`. Keeps class selection.
- Changing the step does not reset anything.
- Every panel reads from `WorkspaceSelection` and renders. Panels do
  not own state.

### 8.3 Primary user journey

1. User lands on Workspace; the selection bar is pre-loaded with the
   first available subset (e.g. `indian-pines-corrected/k=4`); the
   Data step is active.
2. User scans the class chips (Alfalfa, Corn-notill, …, count, color)
   on the Data panel. Clicks `Corn-notill`. The mean spectrum plots;
   the label-mask preview highlights `Corn-notill` pixels in the RGB+
   label preview; the chip joins the selection bar.
3. User clicks a single pixel inside the highlighted mask. The pixel's
   spectrum overlays the class mean. The inspector shows
   `(x, y, class, max-topic, max-topic weight)`.
4. User clicks `Corpus` in the step rail. The recipe list appears with
   the current recipe pre-selected; the vocabulary heatmap shows
   band-token frequencies; the band-position strip aligns with the
   `wavelengthRange` slider value.
5. User drags the wavelength range slider to 700–1300 nm to focus on
   NIR. The band strip dims out-of-range bands; the vocabulary list
   filters; the spectral chart in Data (which they are not currently
   looking at, but the state is global) re-zooms when they go back.
6. User clicks `Topics`. The intertopic map shows the topic discs;
   the centre panel lists top words by relevance with λ at 0.6; the
   right panel shows the band profile of topic 1 (the default primary
   selection) with `Corn-notill`'s mean θ visible as a class-loadings
   bar.
7. User drags λ to 0.2 to favour distinctive tokens. Top words re-rank
   live. User notices the top word `1295nm`; hovers it; the
   intertopic map re-sizes discs to P(topic | 1295nm). User sees that
   `1295nm` is shared between topics 1 and 2.
8. User clicks topic 2 to make it primary. ⌘-clicks topic 5 to add to
   compare. Compare drawer appears showing topic-2 vs. topic-5: top-
   words diff, band-profile overlay with delta, class-loadings delta
   bars per class.
9. User clicks `Comparison`. Spatial comparison strip shows RGB |
   LDA-pseudo-seg | SLIC | KMeans aligned. User toggles the
   "disagreement" mask. Clicks a disagreement pixel; the inspector
   reveals each method's prediction.
10. User clicks `Inference`. Drags a rectangle on the scene; inside the
    rectangle, classifier predictions render immediately. Two-classifier
    compare puts the two prediction masks side by side.
11. User clicks `Validation`. Block status board shows
    "preprocessing-sensitivity: pending"; user expands it; sensitivity
    matrix shows that one preprocessing flag flips topic-2's class
    loading sign. User clicks that cell; the page jumps back to the
    Topics step with the flag toggled.

### 8.4 Per-step specification (panel layout + interaction inventory)

Already given in detail in §4.1–4.6. The numbered surfaces in §7.1
correspond one-to-one to the primary panels in those subsections.

### 8.5 What makes this *not* a static report

- One **page-level selection state** drives every panel; selections
  are URL-serialised and bookmarkable. (Roberts 2007.)
- Every panel **reacts** to selection changes (brushing-and-linking;
  Becker & Cleveland 1987).
- The **λ slider** and the **k / seed / recipe / wavelength-range**
  controls are continuous-feeling parameters; nothing requires a form
  submission. (Shneiderman 1983.)
- **Bidirectional brushing** (click-topic ↔ hover-word) on the Topics
  triptych. (LDAvis 2014.)
- **Compare-by-pinning** for topics, classes, recipes, methods.
  (TopicView; cellxgene.)
- **Spatial preview rectangle** in Inference computes/reads
  predictions inside it on the fly. (SCP; TopicLens.)
- **Histogram-as-filter** for max-topic-loading, wavelength range,
  document length. (Crossfilter / cellxgene.)
- **Inspector** on every clickable surface reveals the underlying
  numbers in a fixed format, no prose. (GEE Code Editor.)
- **One viewport per step** — no scrollable narrative; the Workspace
  is not a paper. (Dashboard Design Patterns 2022.)
- **Selection chips** always visible at the top, individually
  removable. (cellxgene; Vitessce.)

If any of these are missing, the page reverts to a report. If all are
present, the page is a workspace.

---

## Appendix A — quick reference URL list

Topic-model exploration:

- pyLDAvis: https://github.com/bmabey/pyLDAvis,
  https://pyldavis.readthedocs.io/en/latest/readme.html
- LDAvis (R): https://github.com/cpsievert/LDAvis,
  https://www.kennyshirley.com/LDAvis/,
  https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf
- Termite: http://vis.stanford.edu/papers/termite,
  https://idl.uw.edu/papers/termite,
  http://vis.stanford.edu/files/2012-Termite-AVI.pdf
- TopicLens: https://dl.acm.org/doi/abs/10.1109/TVCG.2016.2598445,
  http://users.umiacs.umd.edu/~elm/projects/topiclens/topiclens.pdf
- ArchiText: https://faculty.cc.gatech.edu/~aendert3/resources/Kim2020ArchiText.pdf,
  https://virtual.ieeevis.org/year/2020/paper_f-tvcg-2019030092.html
- HierarchicalTopics: https://ieeevis.org/year/2013/paper/vast/hierarchicaltopics-visually-exploring-large-text-collections-using-topic-hierar
- HTMVS: https://ieeexplore.ieee.org/document/7347675/
- ETM: https://aclanthology.org/2020.tacl-1.29/,
  https://www.cs.columbia.edu/~blei/papers/DiengRuizBlei2020a.pdf,
  https://github.com/adjidieng/ETM
- BERTopic visualisation: https://maartengr.github.io/BERTopic/getting_started/visualization/visualize_topics.html,
  https://maartengr.github.io/BERTopic/getting_started/visualization/visualization.html
- topicwizard: https://github.com/x-tabdeveloping/topicwizard,
  https://x-tabdeveloping.github.io/topicwizard/,
  https://arxiv.org/html/2505.13034v1
- jsLDA: https://mimno.infosci.cornell.edu/jsLDA/
- TopicView: https://www.osti.gov/servlets/purl/1108535
- LDA on hyperspectral (precedent): https://www.nature.com/articles/srep22482,
  https://blog.bogatron.net/blog/2014/07/16/unsupervised-hsi-classification-using-lda/,
  https://onlinelibrary.wiley.com/doi/10.1155/2016/2635124

Hyperspectral / spectral exploration:

- ENVI: https://www.nv5geospatialsoftware.com/Support/Maintenance-Detail/hyperspectral-analytics-in-envi-target-detection-and-spectral-mapping-methods,
  https://envi.geoscene.cn/help/Subsystems/envi/Content/Tutorials/Tools/HyperspectralAnalysisTutorial.htm,
  https://www.glyfac.buffalo.edu/courses/gly560/Lessons/OLD/hyperspectral/assets/ENVI_Tut_12-13.pdf
- QGIS SCP: https://plugins.qgis.org/plugins/SemiAutomaticClassificationPlugin/,
  https://semiautomaticclassificationmanual.readthedocs.io/en/latest/introduction.html,
  https://semiautomaticclassificationmanual.readthedocs.io/en/latest/tutorial_1.html
- HyperSpy: https://hyperspy.org/,
  https://hyperspy.org/hyperspy-doc/current/user_guide/visualisation.html
- SPy: https://www.spectralpython.net/,
  https://www.spectralpython.net/graphics.html
- EnMAP-Box: https://plugins.qgis.org/plugins/enmapboxplugin/,
  https://enmap-box.readthedocs.io/en/latest/index.html,
  https://www.sciencedirect.com/science/article/pii/S2352711023002030
- Sentinel Hub EO Browser: https://www.sentinel-hub.com/explore/eobrowser/,
  https://apps.sentinel-hub.com/eo-browser/,
  https://www.sentinel-hub.com/explore/education/custom-scripts-tutorial/,
  https://dataspace.copernicus.eu/news/2025-6-11-new-custom-scripts-available-copernicus-browser-and-sentinel-hub
- GEE Code Editor: https://developers.google.com/earth-engine/guides/playground,
  https://earthengine.google.com/platform/
- deck.gl-raster: https://kylebarron.dev/deck.gl-raster/overview/,
  https://github.com/kylebarron/deck.gl-raster
- leafmap / geemap: https://leafmap.org/, https://geemap.org/get-started/

UX patterns and design literature:

- Becker & Cleveland 1987 brushing: https://www.tandfonline.com/doi/abs/10.1080/00401706.1987.10488204,
  https://www.sci.utah.edu/~kpotter/Library/Papers/becker:1987:BS/index.html
- Shneiderman 1983 direct manipulation: https://www.cs.umd.edu/~ben/papers/Shneiderman1983Direct.pdf,
  https://dl.acm.org/doi/10.1109/MC.1983.1654471
- Shneiderman 1996 mantra: https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf,
  https://infovis-wiki.net/wiki/Visual_Information-Seeking_Mantra
- Roberts 2007 coordinated multiple views: https://www.cs.kent.ac.uk/pubs/2007/2559/content.pdf,
  https://www.sci.utah.edu/~kpotter/Library/Papers/roberts:2007:CMEV/index.html
- Furnas focus+context: https://dl.acm.org/doi/10.1145/1124772.1124921,
  https://faculty.cc.gatech.edu/~stasko/7450/Papers/cockburn-surveys08.pdf
- Sarikaya et al. 2022, Dashboard Design Patterns: https://arxiv.org/pdf/2205.00757,
  https://dashboarddesignpatterns.github.io/
- Plotly client-side linking / highlight_key: https://plotly-r.com/client-side-linking.html
- Doerr 2024 visual highlighting: https://onlinelibrary.wiley.com/doi/10.1111/cgf.15105
- Anti-pattern critiques: https://kevingee.biz/?p=144,
  https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards

Reference tools (layout):

- CELLxGENE: https://cellxgene.cziscience.com/,
  https://academic.oup.com/bioinformatics/article/37/23/4578/6318386,
  https://www.biorxiv.org/content/10.1101/2021.04.05.438318v1.full
- UCSC Cell Browser: https://cells.ucsc.edu/,
  https://cellbrowser.readthedocs.io/
- Vitessce: https://vitessce.io/, http://vitessce.io/docs/components/,
  https://www.nature.com/articles/s41592-024-02436-x
- Climate Data Store / ERA Explorer: https://cds.climate.copernicus.eu/,
  https://climate.copernicus.eu/era-explorer-app-global-climate-data-made-accessible-all,
  https://climate.copernicus.eu/copernicus-interactive-climate-atlas-guide-powerful-new-c3s-tool

---

## Appendix B — uncertainty / verification flags

Items that should be confirmed against the actual data shipped before
implementation:

- Whether `real_samples.json` carries per-pixel θ or only
  per-class-mean θ. The current grep shows `mean_topic_mixture` per
  class (≥ 16 occurrences) and `top_words` / `band_profile` per topic;
  per-pixel θ is **not** evident in the file as inspected. Surfaces
  that depend on per-pixel θ (topic-mixture histogram filter; topics-
  as-RGB layer; pixel inspector showing topic mixture) need either a
  precomputed per-pixel field or a small additional artifact. Marked
  uncertain.
- Whether `local_core_benchmarks.json` carries full confusion matrices
  per classifier per subset. Surfaces 7 (clickable confusion matrix)
  and 6 (classifier preview rectangle) depend on this. Marked
  uncertain.
- Whether seriation order for the Termite-style band-token matrix is
  worth precomputing on the server or computing on the client. The
  cubes' band count (~200) makes both feasible; recommended to
  precompute and cache.
- The exact set of preprocessing flags exposed in the
  `hidsag_curated_subset` sensitivity panel was not inspected in this
  research pass; the Validation step's most concrete drill-down
  depends on this and should be confirmed against the persistent-state
  file.
