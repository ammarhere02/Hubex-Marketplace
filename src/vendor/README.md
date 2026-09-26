# Vendored AdminLTE 3.2.0 (CSS only)

Downloaded unmodified from the pinned npm release via jsDelivr:

- `adminlte-3.2.0/css/adminlte.min.css` ← `admin-lte@3.2.0/dist/css/adminlte.min.css` (includes Bootstrap 4.6)
- `adminlte-3.2.0/fontawesome/` ← `@fortawesome/fontawesome-free@5.15.4/{css/all.min.css,webfonts}` (the version AdminLTE 3.2.0 depends on; its npm package does not ship `plugins/`)

Why vendored instead of `npm install admin-lte@3.2.0`: that package pulls in ~40 plugin
dependencies, and one of them (summernote) runs a `husky install` postinstall script
that fails outside its own repo, breaking `npm install` for reviewers.

Only CSS is used. No AdminLTE/Bootstrap/jQuery JavaScript is loaded; React components
own every interaction (gallery, variant selectors, tabs).
