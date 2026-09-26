# VNE Gallery of Light v1

Сборка: `python3 scripts/build-gallery-assets.py` (исходники → производные, иконки, OG, реестр).

| Глава | asset id (desktop / mobile) | Ширины | Форматы |
|---|---|---|---|
| hero | gallery-hero-desktop-v1 / gallery-hero-mobile-v2 | 1280, 1672 / 480, 768, 941 | AVIF, WebP |
| space | gallery-space-desktop-v1 / gallery-space-mobile-v1 | то же | AVIF, WebP |
| belonging | gallery-belonging-desktop-v1 / gallery-belonging-mobile-v1 | то же | AVIF, WebP |
| invitation | gallery-invitation-desktop-v1 / gallery-invitation-mobile-v1 | то же | AVIF, WebP |

- Исходники: `source/` (8 PNG набора FIN + обновлённая владельцем hero mobile v2 в PNG).
- `gallery-hero-mobile-v1.png` из FIN — status `candidate`: композиция отличается от v2, решение за владельцем.
- Ширины 1920/2560 и 1080 не созданы: реальное разрешение источников 1672×941 / 941×1672, апскейл запрещён.
- Точки фокуса оценочные (`estimated: true`). approvedBy/approvedAt не заполнены — фактов утверждения нет.
- Контрольные рендеры бренда: `../../brand-renders/`.

## Актуальное расширение

Новые выбранные изображения Threshold, Belonging mobile, Invitation mobile,
Light Interval D и About Stone B зарегистрированы отдельно в
`../addon-v4/asset-manifest.json`; исходные записи v1 выше сохранены как история.
Там же находятся варианты `candidate` и `reserve`, включая каменную скульптуру,
которая не считается третьим событием. Статусы и подключение описаны в
`../addon-v4/README.md`.
