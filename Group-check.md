---                                                                                                                     
  Al aanwezig (weinig werk)
                                                                                                                          
  ┌─────────────────────────┬────────────────────────────────────────────────────┐
  │         Feature         │                       Status                       │                                        
  ├─────────────────────────┼────────────────────────────────────────────────────┤
  │ Groepsfoto / cover      │ ✅ cover_image op groups table                     │
  ├─────────────────────────┼────────────────────────────────────────────────────┤
  │ Groepsbeschrijving      │ ✅ description veld                                │                                        
  ├─────────────────────────┼────────────────────────────────────────────────────┤                                        
  │ Stemrondes              │ ✅ GroupPolls addon volledig uitgebouwd            │                                        
  ├─────────────────────────┼────────────────────────────────────────────────────┤                                        
  │ Beschikbaarheidsdrempel │ ~50% — data er al, alleen notificatie trigger mist │
  └─────────────────────────┴────────────────────────────────────────────────────┘                                        
           
  ---                                                                                                                     
  Snel te implementeren (< 1 dag per stuk)
                                                                                                                          
  - Statistieken — COUNT(trips), COUNT(DISTINCT countries), SUM(days) op bestaande data. Pure SQL, geen nieuw schema.
  - Reisarchief tijdlijn — bestaande group_trips tonen gesorteerd op datum. Al gefetched, andere weergave.                
  - "Wie gaat er mee?" — group_trip_participants tabel bestaat al. Knop in groepsoverzicht is alleen UI.                  
  - WhatsApp export — window.open('https://wa.me/?text=...') met geformatteerde tekst. Geen backend nodig.                
                                                                                                                          
  ---                                                                                                                     
  Matig complex (1–3 dagen)                                                                                               
                                                                                                                          
  - Prikbord / ideeënlijst — nieuwe tabel group_ideas, simpel CRUD. Geen trip-koppeling nodig.
  - Groepskleur — één kolom brand_color op groups, CSS var injecteren in het groepsdetailscherm.                          
  - Gedeelde taakverdeling — lijkt op bestaand todo/packing systeem maar dan group-scoped. Nieuw schema, bestaande        
  UI-patronen hergebruiken.                                                                                               
  - Drempelmelding — webhook/notificatie zodra N leden beschikbaarheid invullen. Trigger in dateProposals route.          
                                                                                                                          
  ---                                    
  Zwaar / later                                                                                                           
               
  - Groepskaart — wereldkaart met bezochte landen: vereist geodata aggregatie + nieuwe map-component.
  - Activiteitenfeed — nieuw events table, websocket pushes, feed UI. Aanzienlijk systeem.                                
  - Mijlpalen — cron job + "eerste reis samen" / "X jaar" logica, leuk maar lage directe waarde.                          
                                                                                                                          
  ---                                                                                                                     
  Advies: begin met statistieken + reisarchief + "wie gaat er mee?" — meeste impact, bestaande data, weinig risico.       
  WhatsApp export is een dag werk en zorgt voor virale verspreiding.                                                      
                                                                    
  Wil je dat ik ergens mee begin?