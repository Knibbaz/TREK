/* Trip publication validation middleware */
import { db } from '../db/database';

export const validateTripRequirements = (req, res, next) => {
  const requirements = db.prepare(`SELECT * FROM trip_requirements`).get();

  // Check required fields
  if (requirements.require_header_photo && !req.body.headerPhoto) {
    return res.status(400).json({ error: 'Header photo is required' });
  }

  // Validate places count
  if (req.body.places.length < requirements.min_places) {
    return res.status(400).json({ error: `Must have at least ${requirements.min_places} places` });
  }

  // Validate days count
  if (req.body.days.length < requirements.min_days) {
    return res.status(400).json({ error: `Must have at least ${requirements.min_days} days` });
  }

  // Validate category percentage
  const placesWithCategory = req.body.places.filter(p => p.category).length;
  const percentage = (placesWithCategory / req.body.places.length) * 100;
  if (percentage < requirements.min_category_percentage) {
    return res.status(400).json({ error: `Must have ${requirements.min_category_percentage}% of places with categories` });
  }

  // Validate at least one activity per day
  for (const day of req.body.days) {
    if (day.activities.length === 0) {
      return res.status(400).json({ error: 'Each day must have at least one activity' });
    }
  }

  next();
};