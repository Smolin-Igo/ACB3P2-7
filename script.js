// BarrPeps Database - Main JavaScript
// Blood-Brain Barrier Penetrating Peptides Database

let peptidesData = [];
let currentView = 'table';
let sortColumn = 'peptide_name';
let sortDirection = 'asc';
let filteredPeptides = [];

// PDB Viewer variables
let pdbViewer = null;
let pdbContentCache = null;
let currentRepresentation = 'cartoon';

// Helper functions
function getActivityCategory(ic50) {
    if (!ic50 || ic50 === '') return null;
    const value = parseFloat(ic50);
    if (isNaN(value)) return null;
    if (value < 10) return 'high';
    if (value <= 50) return 'medium';
    return 'low';
}

function getActivityText(category) {
    switch(category) {
        case 'high': return 'High';
        case 'medium': return 'Medium';
        case 'low': return 'Low';
        default: return 'N/A';
    }
}

function getActivityClass(category) {
    switch(category) {
        case 'high': return 'activity-high';
        case 'medium': return 'activity-medium';
        case 'low': return 'activity-low';
        default: return '';
    }
}

function getPeptideUrl(peptideId, peptideName) {
    return `peptide.html?id=${peptideId}&name=${encodeURIComponent(peptideName)}`;
}

// Escape HTML for safe display
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy SMILES to clipboard
function copySMILES(smiles) {
    navigator.clipboard.writeText(smiles).then(() => {
        const btn = document.querySelector('.copy-btn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }).catch(() => {
        alert('Failed to copy SMILES');
    });
}

// Show under construction modal
function showUnderConstruction() {
    const modal = document.getElementById('underConstructionModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('underConstructionModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('underConstructionModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Load CSV data
async function loadCSV() {
    try {
        console.log('Loading CSV...');
        const response = await fetch('structure_ACPBBBP.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        console.log('CSV loaded, length:', csvText.length);
        parseCSV(csvText);
    } catch (error) {
        console.error('Error loading CSV:', error);
        const errorHtml = `
            <div class="error-message">
                <p>Error loading data: ${error.message}</p>
                <p>Please ensure structure_ACPBBBP.csv is in the same directory.</p>
                <button onclick="location.reload()" class="btn-primary" style="margin-top: 1rem;">Retry</button>
            </div>
        `;
        
        const containers = ['featuredPeptides', 'resultsContainer', 'peptideDetail'];
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container && container.innerHTML && container.innerHTML.includes('Loading')) {
                container.innerHTML = errorHtml;
            }
        });
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        console.error('CSV is empty');
        return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    console.log('Headers:', headers);
    
    peptidesData = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        
        let fields = [];
        let inQuotes = false;
        let currentField = '';
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        fields.push(currentField.trim());
        
        if (fields.length >= headers.length) {
            const peptide = {};
            headers.forEach((header, index) => {
                let value = fields[index] || '';
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                peptide[header] = value;
            });
            
            // Parse numeric values
            peptide.length = parseInt(peptide.length) || 0;
            peptide.molecular_weight = parseFloat(peptide.molecular_weight) || 0;
            peptide.net_charge = parseFloat(peptide.net_charge) || 0;
            peptide.hydrophobicity = parseFloat(peptide.hydrophobicity) || 0;
            peptide.id = i;
            
            if (peptide.anticancer_ic50 && peptide.anticancer_ic50 !== '') {
                peptide.anticancer_ic50_value = parseFloat(peptide.anticancer_ic50);
            }
            
            peptidesData.push(peptide);
        }
    }
    
    console.log('Parsed peptides:', peptidesData.length);
    filteredPeptides = [...peptidesData];
    
    const currentPage = window.location.pathname.split('/').pop();
    console.log('Current page:', currentPage);
    
    if (currentPage === 'index.html' || currentPage === '') {
        initHomePage();
    } else if (currentPage === 'browse.html') {
        initBrowsePage();
    } else if (currentPage === 'peptide.html') {
        initPeptidePage();
    }
}

// Home page initialization
function initHomePage() {
    console.log('Initializing home page');
    updateHomeStats();
    displayFeaturedPeptides();
}

function updateHomeStats() {
    const total = peptidesData.length;
    if (total === 0) return;
    
    const totalEl = document.getElementById('totalPeptides');
    
    if (totalEl) totalEl.textContent = total;
}

function displayFeaturedPeptides() {
    const container = document.getElementById('featuredPeptides');
    if (!container) return;
    
    const featured = peptidesData.slice(0, 6);
    
    if (featured.length === 0) {
        container.innerHTML = '<div class="loading">No peptides found in database</div>';
        return;
    }
    
    let html = '';
    featured.forEach(peptide => {
        const activityCat = getActivityCategory(peptide.anticancer_ic50);
        const activityClass = getActivityClass(activityCat);
        const activityText = getActivityText(activityCat);
        
        html += `
            <a href="${getPeptideUrl(peptide.id, peptide.peptide_name)}" class="peptide-card">
                <div class="card-header">
                    <h3>${peptide.peptide_name || 'Unnamed Peptide'}</h3>
                </div>
                <div class="card-content">
                    <div class="card-row">
                        <div class="card-label">Source:</div>
                        <div class="card-value">${peptide.source_organism || 'N/A'}</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Length / MW:</div>
                        <div class="card-value">${peptide.length || 'N/A'} aa / ${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'} Da</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Activity:</div>
                        <div class="card-value"><span class="badge ${activityClass}">${activityText}</span> (${peptide.anticancer_ic50 || 'N/A'} µM)</div>
                    </div>
                </div>
            </a>
        `;
    });
    
    container.innerHTML = html;
}

// Browse page initialization
function initBrowsePage() {
    console.log('Initializing browse page');
    filteredPeptides = [...peptidesData];
    updateBrowseStats();
    displayBrowseResults();
    setupBrowseEventListeners();
}

function setupBrowseEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const activityFilter = document.getElementById('activityFilter');
    const structureFilter = document.getElementById('structureFilter');
    
    if (searchInput) searchInput.addEventListener('keyup', searchPeptides);
    if (activityFilter) activityFilter.addEventListener('change', searchPeptides);
    if (structureFilter) structureFilter.addEventListener('change', searchPeptides);
}

function updateBrowseStats() {
    const count = filteredPeptides.length;
    const countElement = document.getElementById('resultsCount');
    if (countElement) countElement.textContent = `Found peptides: ${count}`;
}

function searchPeptides() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const activityFilter = document.getElementById('activityFilter').value;
    const structureFilter = document.getElementById('structureFilter').value;
    
    filteredPeptides = peptidesData.filter(peptide => {
        const matchesSearch = searchTerm === '' || 
            (peptide.peptide_name && peptide.peptide_name.toLowerCase().includes(searchTerm)) ||
            (peptide.sequence_one_letter && peptide.sequence_one_letter.toLowerCase().includes(searchTerm)) ||
            (peptide.source_organism && peptide.source_organism.toLowerCase().includes(searchTerm));
        
        let matchesActivity = true;
        if (activityFilter !== 'all') {
            const activityCat = getActivityCategory(peptide.anticancer_ic50);
            matchesActivity = activityCat === activityFilter;
        }
        
        let matchesStructure = true;
        if (structureFilter !== 'all') {
            matchesStructure = (peptide.structure_type || '').toLowerCase() === structureFilter.toLowerCase();
        }
        
        return matchesSearch && matchesActivity && matchesStructure;
    });
    
    updateBrowseStats();
    displayBrowseResults();
}

function resetFilters() {
    const searchInput = document.getElementById('searchInput');
    const activityFilter = document.getElementById('activityFilter');
    const structureFilter = document.getElementById('structureFilter');
    
    if (searchInput) searchInput.value = '';
    if (activityFilter) activityFilter.value = 'all';
    if (structureFilter) structureFilter.value = 'all';
    
    filteredPeptides = [...peptidesData];
    updateBrowseStats();
    displayBrowseResults();
}

function displayBrowseResults() {
    const container = document.getElementById('resultsContainer');
    if (!container) return;
    
    const count = filteredPeptides.length;
    
    if (count === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem;">No peptides found</div>';
        return;
    }
    
    if (currentView === 'table') {
        displayTableView(container);
    } else {
        displayCardBrowseView(container);
    }
}

function displayTableView(container) {
    let html = `
        <div class="table-view">
            <table>
                <thead>
                    <tr>
                        <th onclick="sortBy('peptide_name')">Name</th>
                        <th onclick="sortBy('sequence_one_letter')">Sequence</th>
                        <th onclick="sortBy('length')">Length</th>
                        <th onclick="sortBy('molecular_weight')">MW (Da)</th>
                        <th>Activity (IC50)</th>
                        <th onclick="sortBy('source_organism')">Source</th>
                        <th>PDB</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    filteredPeptides.forEach(peptide => {
        const sequenceDisplay = peptide.sequence_one_letter ? 
            (peptide.sequence_one_letter.length > 35 ? 
                peptide.sequence_one_letter.substring(0, 35) + '...' : 
                peptide.sequence_one_letter) : 'N/A';
        
        const ic50Display = peptide.anticancer_ic50 ? `${peptide.anticancer_ic50} µM` : 'N/A';
        const activityCat = getActivityCategory(peptide.anticancer_ic50);
        const activityClass = getActivityClass(activityCat);
        const activityText = getActivityText(activityCat);
        
        html += `
            <tr>
                <td><strong>${peptide.peptide_name || 'N/A'}</strong></td>
                <td style="font-family: monospace; font-size: 0.65rem;">${sequenceDisplay}</td>
                <td>${peptide.length || 'N/A'}</td>
                <td>${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'}</td>
                <td><span class="badge ${activityClass}">${activityText}</span> (${ic50Display})</td>
                <td>${peptide.source_organism || 'N/A'}</td>
                <td>${peptide.PDB || '—'}</td>
                <td><a href="${getPeptideUrl(peptide.id, peptide.peptide_name)}" class="btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.65rem; text-decoration: none;">View</a></td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function displayCardBrowseView(container) {
    let html = '<div class="peptide-grid">';
    
    filteredPeptides.forEach(peptide => {
        const activityCat = getActivityCategory(peptide.anticancer_ic50);
        const activityClass = getActivityClass(activityCat);
        const activityText = getActivityText(activityCat);
        const ic50Display = peptide.anticancer_ic50 ? `${peptide.anticancer_ic50} µM` : 'N/A';
        
        html += `
            <a href="${getPeptideUrl(peptide.id, peptide.peptide_name)}" class="peptide-card">
                <div class="card-header">
                    <h3>${peptide.peptide_name || 'Unnamed Peptide'}</h3>
                </div>
                <div class="card-content">
                    <div class="card-row">
                        <div class="card-label">Source:</div>
                        <div class="card-value">${peptide.source_organism || 'N/A'}</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Length / MW:</div>
                        <div class="card-value">${peptide.length || 'N/A'} aa / ${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'} Da</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Activity:</div>
                        <div class="card-value"><span class="badge ${activityClass}">${activityText}</span> (${ic50Display})</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">PDB:</div>
                        <div class="card-value">${peptide.PDB || '—'}</div>
                    </div>
                </div>
            </a>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function setView(view) {
    currentView = view;
    const btns = document.querySelectorAll('.toggle-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    if (view === 'table') {
        btns[0].classList.add('active');
    } else {
        btns[1].classList.add('active');
    }
    displayBrowseResults();
}

function sortBy(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    filteredPeptides.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        
        if (valA === undefined || valA === null || valA === '') valA = -Infinity;
        if (valB === undefined || valB === null || valB === '') valB = -Infinity;
        
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    displayBrowseResults();
}

// Fetch PDB structure from RCSB API
async function fetchPDBStructure(pdbId) {
    if (!pdbId || pdbId === '' || pdbId === 'N/A') {
        return null;
    }
    
    try {
        const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
        if (!response.ok) {
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error('Error fetching PDB:', error);
        return null;
    }
}

// Render PDB structure with two representations
function renderPDBStructure(pdbContent, pdbId) {
    const container = document.getElementById('structure-viewer-pdb');
    if (!container) return;
    
    if (!pdbContent) {
        container.innerHTML = `
            <div class="no-structure">
                <p>No PDB structure available for this peptide.</p>
                <p style="font-size: 0.7rem; margin-top: 0.5rem;">PDB ID: ${pdbId || 'N/A'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    // Create viewer
    pdbViewer = $3Dmol.createViewer(container, { backgroundColor: 'white' });
    pdbViewer.addModel(pdbContent, 'pdb');
    pdbViewer.zoomTo();
    
    // Store for color scheme changes
    window.pdbContentCache = pdbContent;
    
    // Set default representation (cartoon)
    setRepresentation('cartoon');
}

function setRepresentation(type) {
    if (!pdbViewer) return;
    
    // Clear all styles
    pdbViewer.removeAllModels();
    pdbViewer.addModel(window.pdbContentCache, 'pdb');
    
    if (type === 'cartoon') {
        // Cartoon representation - color by secondary structure
        pdbViewer.setStyle({}, { 
            cartoon: { 
                colorscheme: 'ss',
                opacity: 0.9
            } 
        });
        currentRepresentation = 'cartoon';
    } else if (type === 'ballAndStick') {
        // Ball and stick representation - color by element
        pdbViewer.setStyle({}, { 
            stick: { colorscheme: 'elem', radius: 0.15 },
            sphere: { colorscheme: 'elem', scale: 0.3 }
        });
        currentRepresentation = 'ballAndStick';
    }
    
    pdbViewer.zoomTo();
    pdbViewer.render();
    
    // Update active button state
    const cartoonBtn = document.getElementById('btn-cartoon');
    const ballBtn = document.getElementById('btn-ballstick');
    
    if (cartoonBtn && ballBtn) {
        if (type === 'cartoon') {
            cartoonBtn.classList.add('active');
            ballBtn.classList.remove('active');
        } else {
            cartoonBtn.classList.remove('active');
            ballBtn.classList.add('active');
        }
    }
}

function rotatePDB(direction) {
    // Rotation functionality removed - buttons are hidden via CSS
    return;
}

function resetPDBView() {
    if (!pdbViewer) return;
    pdbViewer.zoomTo();
    pdbViewer.render();
}

// Peptide detail page
async function initPeptidePage() {
    console.log('Initializing peptide page');
    
    const urlParams = new URLSearchParams(window.location.search);
    const peptideId = parseInt(urlParams.get('id'));
    const peptide = peptidesData.find(p => p.id === peptideId);
    
    if (!peptide) {
        const detailContainer = document.getElementById('peptideDetail');
        if (detailContainer) {
            detailContainer.innerHTML = `
                <div class="error-message">
                    <p>Peptide not found</p>
                    <a href="browse.html" class="btn-primary">Browse Database</a>
                </div>
            `;
        }
        return;
    }
    
    document.title = `${peptide.peptide_name} - BarrPeps Database`;
    
    let pdbContent = null;
    let pdbId = peptide.PDB && peptide.PDB !== '' ? peptide.PDB : null;
    
    if (pdbId) {
        pdbContent = await fetchPDBStructure(pdbId);
        window.pdbContentCache = pdbContent;
    }
    
    displayPeptideDetail(peptide, pdbContent, pdbId);
}

function displayPeptideDetail(peptide, pdbContent, pdbId) {
    const activityCat = getActivityCategory(peptide.anticancer_ic50);
    const activityClass = getActivityClass(activityCat);
    const activityText = getActivityText(activityCat);
    
    const hasPDB = pdbContent !== null;
    const hasSMILES = peptide.SMILES && peptide.SMILES !== '' && peptide.SMILES !== 'N/A';
    
    const html = `
        <div class="peptide-detail-container">
            <div style="margin-bottom: 1rem;">
                <a href="browse.html" class="btn-secondary" style="display: inline-block; margin-bottom: 0.75rem; font-size: 0.75rem; padding: 0.35rem 0.7rem;">← Back to Browse</a>
                <h1 style="color: #2c5282; font-size: 1.5rem; margin-bottom: 0.2rem;">${peptide.peptide_name || 'N/A'}</h1>
                <p style="color: #718096; font-size: 0.75rem;">ID: ${peptide.id} | Last updated: ${peptide.created_date || 'N/A'}</p>
            </div>
            
            <div class="structure-viewer">
                <h3 style="font-size: 1rem; margin-bottom: 0.75rem;">3D Structure Visualization</h3>
                ${hasPDB ? '<div id="structure-viewer-pdb" class="structure-container"></div>' : '<div class="no-structure"><p>No PDB structure available for this peptide.</p></div>'}
                
                ${hasPDB ? `
                <div class="structure-controls">
                    <button id="btn-cartoon" class="active" onclick="setRepresentation('cartoon')">Cartoon</button>
                    <button id="btn-ballstick" onclick="setRepresentation('ballAndStick')">Ball & Stick</button>
                    <button onclick="resetPDBView()">Reset View</button>
                </div>
                <div class="structure-legend">
                    <div class="legend-item"><div class="legend-color alpha"></div><span>α-Helix</span></div>
                    <div class="legend-item"><div class="legend-color beta"></div><span>β-Sheet</span></div>
                    <div class="legend-item"><div class="legend-color coil"></div><span>Coil/Turn</span></div>
                    <div class="legend-item"><div class="legend-color carbon"></div><span>Carbon</span></div>
                    <div class="legend-item"><div class="legend-color oxygen"></div><span>Oxygen</span></div>
                    <div class="legend-item"><div class="legend-color nitrogen"></div><span>Nitrogen</span></div>
                </div>
                <div class="pdb-info">
                    <strong>PDB ID: ${pdbId || peptide.PDB || 'N/A'}</strong> | 
                    <a href="https://www.rcsb.org/structure/${pdbId || peptide.PDB}" target="_blank">View on RCSB.org</a>
                </div>
                ` : ''}
            </div>
            
            <div class="detail-section">
                <h3>Basic Information</h3>
                <div class="detail-row"><span class="detail-label">Peptide Name:</span><span class="detail-value">${peptide.peptide_name || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Sequence (1-letter):</span><span class="detail-value" style="font-family: monospace; font-size: 0.75rem; word-break: break-all;">${peptide.sequence_one_letter || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Sequence (3-letter):</span><span class="detail-value" style="font-size: 0.7rem; word-break: break-all;">${peptide.sequence_three_letter || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Length:</span><span class="detail-value">${peptide.length || 'N/A'} aa</span></div>
                <div class="detail-row"><span class="detail-label">Molecular Weight:</span><span class="detail-value">${peptide.molecular_weight ? peptide.molecular_weight.toFixed(2) : 'N/A'} Da</span></div>
                <div class="detail-row"><span class="detail-label">Net Charge:</span><span class="detail-value">${peptide.net_charge || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Hydrophobicity:</span><span class="detail-value">${peptide.hydrophobicity || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Structural Properties</h3>
                <div class="detail-row"><span class="detail-label">Structure Type:</span><span class="detail-value">${peptide.structure_type || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">PDB ID:</span><span class="detail-value">${pdbId ? `<a href="https://www.rcsb.org/structure/${pdbId}" target="_blank">${pdbId}</a>` : (peptide.PDB || 'N/A')}</span></div>
                ${hasSMILES ? `
                <div class="detail-row">
                    <span class="detail-label">SMILES:</span>
                    <span class="detail-value">
                        <div class="smiles-container" style="background: #fef5e7; padding: 0.5rem; border-radius: 6px; margin-top: 0.25rem;">
                            <strong style="font-size: 0.75rem;">Simplified Molecular Input Line Entry System</strong>
                            <div style="font-family: monospace; font-size: 0.65rem; word-break: break-all; background: white; padding: 0.5rem; border-radius: 4px; border: 1px solid #e2e8f0; margin-top: 0.4rem;">${escapeHtml(peptide.SMILES)}</div>
                            <button class="copy-btn" onclick="copySMILES('${escapeHtml(peptide.SMILES)}')" style="margin-top: 0.4rem; padding: 0.3rem 0.8rem; background: #4299e1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem;">Copy SMILES</button>
                            <p style="font-size: 0.6rem; color: #718096; margin-top: 0.4rem;">SMILES is a specification for describing chemical molecule structures using ASCII strings.</p>
                        </div>
                    </span>
                </div>
                ` : '<div class="detail-row"><span class="detail-label">SMILES:</span><span class="detail-value">N/A</span></div>'}
            </div>
            
            <div class="detail-section">
                <h3>Anticancer Activity</h3>
                <div class="detail-row"><span class="detail-label">IC50:</span><span class="detail-value">${peptide.anticancer_ic50 || 'N/A'} µM <span class="badge ${activityClass}" style="margin-left: 0.4rem;">${activityText}</span></span></div>
                <div class="detail-row"><span class="detail-label">Cancer Cell Lines:</span><span class="detail-value">${peptide.anticancer_cell_lines || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Selectivity Index:</span><span class="detail-value">${peptide.anticancer_selectivity || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Antimicrobial Activity</h3>
                <div class="detail-row"><span class="detail-label">Targets:</span><span class="detail-value">${peptide.antimicrobial_targets || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">MIC:</span><span class="detail-value">${peptide.antimicrobial_mic || 'N/A'} µM</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Biological Source</h3>
                <div class="detail-row"><span class="detail-label">Organism:</span><span class="detail-value">${peptide.source_organism || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Blood-Brain Barrier Penetration</h3>
                <div class="detail-row"><span class="detail-label">Permeability Value:</span><span class="detail-value">${peptide.bbb_permeability_value || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Transport Type:</span><span class="detail-value">${peptide.bbb_transport_type || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Model:</span><span class="detail-value">${peptide.bbb_model || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Toxicity & Stability</h3>
                <div class="detail-row"><span class="detail-label">Hemolysis (LC50):</span><span class="detail-value">${peptide.toxicity_hemolysis || 'N/A'} µM</span></div>
                <div class="detail-row"><span class="detail-label">Serum Stability:</span><span class="detail-value">${peptide.stability_serum || 'N/A'} h</span></div>
                <div class="detail-row"><span class="detail-label">Synergy:</span><span class="detail-value">${peptide.synergy || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>References</h3>
                <div class="detail-row"><span class="detail-label">PMID:</span><span class="detail-value">${peptide.pmid || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">DOI:</span><span class="detail-value">${peptide.doi ? `<a href="https://doi.org/${peptide.doi}" target="_blank">${peptide.doi}</a>` : 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Notes:</span><span class="detail-value">${peptide.notes || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Created Date:</span><span class="detail-value">${peptide.created_date || 'N/A'}</span></div>
            </div>
        </div>
    `;
    
    const detailContainer = document.getElementById('peptideDetail');
    if (detailContainer) {
        detailContainer.innerHTML = html;
    }
    
    if (hasPDB && pdbContent) {
        setTimeout(() => {
            renderPDBStructure(pdbContent, pdbId);
        }, 100);
    }
}

// Make functions globally available
window.searchPeptides = searchPeptides;
window.resetFilters = resetFilters;
window.setView = setView;
window.sortBy = sortBy;
window.setRepresentation = setRepresentation;
window.rotatePDB = rotatePDB;
window.resetPDBView = resetPDBView;
window.copySMILES = copySMILES;
window.showUnderConstruction = showUnderConstruction;
window.closeModal = closeModal;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, starting CSV load...');
    loadCSV();
});