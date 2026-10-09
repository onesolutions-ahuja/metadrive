import { SpiceService } from '../services/spiceService';

const ALLIANCE_SCHEMA = `
  definition user {}
  
  definition record {
    relation owner: user
    relation reader: user
    
    permission view = reader + owner
    permission edit = owner
  }
`;

async function initializeSecurity() {
  try {
    console.log('📜 Applying Zanzibar Schema to SpiceDB...');
    await SpiceService.applySchema(ALLIANCE_SCHEMA);
    
    console.log('🪄 Granting access permissions...');
    // Harry gets EDIT access (owner) to Record 101
    await SpiceService.grantAccess('record', '101', 'owner', 'harry.potter');
    
    // Hermione gets VIEW access (reader) to Record 101
    await SpiceService.grantAccess('record', '101', 'reader', 'hermione.granger');

    console.log('🔒 Testing Access Permissions...');
    
    const canHarryEdit = await SpiceService.checkAccess('record', '101', 'edit', 'harry.potter');
    console.log(`Can Harry edit Record 101? ${canHarryEdit ? '✅ Yes' : '❌ No'}`);

    const canHermioneEdit = await SpiceService.checkAccess('record', '101', 'edit', 'hermione.granger');
    console.log(`Can Hermione edit Record 101? ${canHermioneEdit ? '✅ Yes' : '❌ No'}`);

    const canDracoView = await SpiceService.checkAccess('record', '101', 'view', 'draco.malfoy');
    console.log(`Can Draco view Record 101? ${canDracoView ? '✅ Yes' : '❌ No (Blocked)'}`);

  } catch (error) {
    console.error('Error initializing SpiceDB:', error);
  }
}

initializeSecurity();