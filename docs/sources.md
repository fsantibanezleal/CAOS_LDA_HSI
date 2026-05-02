# Sources

Repo-local short reference. The canonical extended bibliography lives
on the wiki page
[References](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/References)
and in
[`legacy/papers/CITATIONS.md`](../legacy/papers/CITATIONS.md).

## Primary citation for this repository

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F.,
> Egaña, Á. (2022). *Geometallurgical estimation of mineral samples
> from hyperspectral images and statistical topic modelling*. 18th
> International Conference on Mineral Processing and Geometallurgy
> (Procemin Geomet).
> [ResearchGate](https://www.researchgate.net/publication/369708272)

## Public dataset citation

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F.,
> Egaña, Á. (2023). *HIDSAG: Hyperspectral Image Database for
> Supervised Analysis in Geometallurgy*. **Scientific Data** 10, 154.
> [doi:10.1038/s41597-023-02061-x](https://doi.org/10.1038/s41597-023-02061-x).

## Methodology line

- Egaña, A. F., Santibáñez-Leal, F. A. et al. (2020). *A Robust
  Stochastic Approach to Mineral Hyperspectral Analysis for
  Geometallurgy*. **Minerals** 10(12), 1139.
  [doi](https://doi.org/10.3390/min10121139)
- Santibáñez-Leal, F. A. et al. (2020). *Multi Pixel Stochastic
  Approach to Mineral Samples Spectral Analysis for Geometallurgical
  Modeling*. Procemin Geomet 2020.

## LDA / topic modelling foundations

- Blei, D. M., Ng, A. Y., Jordan, M. I. (2003). *Latent Dirichlet
  Allocation*. **JMLR** 3, 993–1022.
- Heinrich, G. (2005). *Parameter estimation for text analysis*.
- Hoffman, M., Blei, D., Bach, F. (2010). *Online Learning for Latent
  Dirichlet Allocation*. **NIPS 2010**.
- Rehurek, R., Sojka, P. (2010). *gensim — Software Framework for
  Topic Modelling with Large Corpora*. LREC NLP frameworks workshop.
- Sievert, C., Shirley, K. (2014). *LDAvis*. ACL Workshop.
- Röder, M., Both, A., Hinneburg, A. (2015). *Exploring the Space of
  Topic Coherence Measures*. WSDM.
- Teh, Y. W., Jordan, M. I., Beal, M. J., Blei, D. M. (2006).
  *Hierarchical Dirichlet Processes*. JASA.
- Zhai, K., Boyd-Graber, J. (2013). *Online LDA with Infinite
  Vocabulary*. ICML.
- Dieng, A. B., Ruiz, F. J. R., Blei, D. M. (2020). *Topic Modeling in
  Embedding Spaces*. TACL.

## PTM on hyperspectral — modern line

- Wahabzada, M., Mahlein, A.-K., Bauckhage, C., Steiner, U.,
  Oerke, E.-C., Kersting, K. — plant phenotyping LDA work.
- Zou, S., Zare, A. (2017). *Partial-Membership LDA* (PM-LDA) for
  hyperspectral unmixing.
- Borsoi, R. A. et al. (2021). *Spectral Variability in Hyperspectral
  Data Unmixing: A Comprehensive Review*. **IEEE GRSM**.
- Mantripragada, K. et al. (2024). *LDVAE / SpACNN-LDVAE*. IEEE TGRS
  and follow-on arXiv work.

## Hyperspectral / spectral foundations

- Achanta, R. et al. (2012). *SLIC superpixels*. IEEE TPAMI.
- Clark, R. N., Roush, T. L. (1984). *Reflectance Spectroscopy*. JGR.
- Kruse, F. A. (2012). *Spectral-feature-based analysis*. SPIE.
- Tarabalka, Y., Benediktsson, J. A., Chanussot, J. (2009 / 2010).
  *Spectral–spatial classification* and *Watershed segmentation*.
- Theiler, J. P., Gisler, G. (1997). *Contiguity-enhanced k-means*.
- Villa, A., Chanussot, J., Benediktsson, J. A. (2013). *Unsupervised
  classification of HSI*. Pattern Recognition.

## Public datasets

- Kokaly, R. F. et al. (2017). *USGS Spectral Library Version 7*.
  USGS DS 1035. [doi](https://doi.org/10.3133/ds1035)
- ECOSTRESS Spectral Library (Caltech / NASA).
- UPV/EHU GIC public HSI scenes
  ([ehu.eus](https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes)).
- Borsoi unmixing examples
  ([github.com/ricardoborsoi](https://github.com/ricardoborsoi)).
- HIDSAG Figshare release (this project).
- WHU-Hi, HyRANK, Houston 2013/2018/2020, EuroSAT — tracked.

## Software stack

- Backend: Python 3.12, FastAPI, uvicorn, ORJSON, pydantic-settings.
- Frontend: TypeScript, React 18, Vite, react-i18next, Zustand.
- Pipeline: numpy, scipy, scikit-learn, scikit-image, h5py, tifffile,
  Pillow, requests.

## Author

- ORCID: [0000-0002-0150-3246](https://orcid.org/0000-0002-0150-3246)
- Publications page:
  [fsantibanezleal.github.io/publications](https://fsantibanezleal.github.io/publications/)
- GitHub:
  [github.com/fsantibanezleal](https://github.com/fsantibanezleal)
