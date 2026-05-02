/* Admin trip requirements API */
import express from 'express';
const router = express.Router();

// Get current requirements
router.get('/admin/trip-requirements', (req, res) => {
  const requirements = db.prepare(`SELECT * FROM trip_requirements`).get();
  res.json(requirements);
});

// Update requirements
router.put('/admin/trip-requirements', (req, res) => {
  const { min_places, min_days, min_category_percentage, require_header_photo } = req.body;
  db.prepare(`
    UPDATE trip_requirements 
    SET min_places = ?, 
        min_days = ?, 
        min_category_percentage = ?, 
        require_header_photo = ?
  `).run(min_places, min_days, min_category_percentage, require_header_photo);
  res.json({ success: true });
});

export default router;