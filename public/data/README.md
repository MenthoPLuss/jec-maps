# JEC Map data

This directory stores the custom campus GeoJSON used by the map.

## Files

- `campus-boundary.geojson`: the outer JEC campus polygon.
- `buildings.geojson`: individual campus building polygons.

## Building properties

Each building feature should include at least:

```json
{
  "name": "Computer Science & Engineering",
  "category": "academic"
}
```

Recommended categories include `academic`, `administration`, `hostel`, `sports`, `food`, and `gate`.

Coordinates must use GeoJSON order: `[longitude, latitude]`.
