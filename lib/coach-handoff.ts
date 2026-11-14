export function coachUrl(date:string,taskId?:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Ongeldige datum.');
 const prompt=`Heroverleg mijn dagplan voor ${date} via vDcoach.${taskId?' Het gaat in het bijzonder om taak-ID '+taskId+'.':''} Lees eerst get_coach_context en get_day voor deze datum. Controleer bevestigde voortgang, agenda, deadlines en bewuste keuzes. Vraag mij wat veranderd is of waar ik vastloop. Help kiezen en maak een concreet haalbaar voorstel. Behoud afgeronde, verwijderde, wachtende en geparkeerde taken en mijn geschiedenis. Raad geen ontbrekende telefooninvoer. Pas het opgeslagen dagplan pas aan na mijn bevestiging, met de actuele revisie en bronverwijzingen. Geen agenda-aanpassingen, berichten of automatische taakafronding.`;
 return 'https://chatgpt.com/?q='+encodeURIComponent(prompt);
}
