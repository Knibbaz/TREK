import { http, HttpResponse } from 'msw';

export const addonHandlers = [
  http.get('/api/addons', () => {
    return HttpResponse.json({
      bagTracking: false,
      addons: [
        { id: 'vacay', name: 'Vacay', type: 'feature', icon: 'calendar', enabled: true },
        { id: 'atlas', name: 'Atlas', type: 'feature', icon: 'map', enabled: true },
        { id: 'packing', name: 'Lists', type: 'trip', icon: 'ListChecks', enabled: true },
        { id: 'budget', name: 'Costs', type: 'trip', icon: 'Wallet', enabled: true },
        { id: 'documents', name: 'Documents', type: 'trip', icon: 'FileText', enabled: true },
        { id: 'collab', name: 'Collab', type: 'trip', icon: 'Users', enabled: true },
      ],
    });
  }),
];
