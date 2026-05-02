/* Admin form for trip requirements */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TripRequirementsForm() {
  const [requirements, setRequirements] = useState({
    min_places: 5,
    min_days: 3,
    min_category_percentage: 80,
    require_header_photo: true
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/trip-requirements')
      .then(response => response.json())
      .then(data => setRequirements(data))
      .catch(console.error);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetch('/api/admin/trip-requirements', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requirements)
    })
    .then(response => {
      if (!response.ok) throw new Error('Save failed');
      alert('Requirements saved successfully');
    })
    .catch(error => {
      console.error(error);
      setError(error.message);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
        <p>{error}</p>
      </div>}
      
      <div className="mb-4">
        <label className="block text-gray-700 mb-2 font-medium">Minimum Places</label>
        <input
          type="number"
          value={requirements.min_places}
          onChange={(e) => setRequirements({...requirements, min_places: parseInt(e.target.value)})}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="1"
        />
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 mb-2 font-medium">Minimum Days</label>
        <input
          type="number"
          value={requirements.min_days}
          onChange={(e) => setRequirements({...requirements, min_days: parseInt(e.target.value)})}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="1"
        />
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 mb-2 font-medium">Category Percentage</label>
        <input
          type="number"
          value={requirements.min_category_percentage}
          onChange={(e) => setRequirements({...requirements, min_category_percentage: parseInt(e.target.value)})}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="1"
          max="100"
        />
      </div>
      
      <div className="mb-4 flex items-center">
        <input
          type="checkbox"
          checked={requirements.require_header_photo}
          onChange={(e) => setRequirements({...requirements, require_header_photo: e.target.checked})}
          className="mr-2 h-5 w-5 text-blue-600"
        />
        <label className="text-gray-700 font-medium">Require Header Photo</label>
      </div>
      
      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
      >
        Save Requirements
      </button>
    </form>
  );
}