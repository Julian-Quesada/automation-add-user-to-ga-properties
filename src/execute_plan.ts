import { defaultGoogleAPIWrapper, readCSV, CSVLogger } from "api-schema-utils";
import {createGA4PropertyUser} from './ga4Methods.js';

async function createGAAccountUser(accountId: string, email: string, permissions: string[]){
	let result = await defaultGoogleAPIWrapper.wrapGAPICall({
		idempotent: false,
		resource: `createAccountUserLink_${accountId}`,
		desc: `Creating User for account ${accountId}`
	}, async () => {
		let response = await defaultGoogleAPIWrapper.google.analytics({version: 'v3'}).management.accountUserLinks.insert({
			accountId: accountId,
			requestBody: {
				permissions:{
					local: permissions
				},
				userRef: {
					email: email
				}
			}
		})
		return response.data;
	})
	return result;
}

async function createGAPropertyUser(accountId: string, propertyId: string, email: string, permissions: string[]){
	let result = await defaultGoogleAPIWrapper.wrapGAPICall({
		idempotent: false, //creating the same user twice just results in an update to the user's permissions
		resource: `createAccountUserLink_${accountId}`,
		desc: `Creating User for account ${accountId}`
	}, async () => {
		let response = await defaultGoogleAPIWrapper.google.analytics({version: 'v3'}).management.webpropertyUserLinks.insert({
			accountId: accountId,
			webPropertyId: propertyId,
			requestBody: {
				permissions:{
					local: permissions
				},
				userRef: {
					email: email
				}
			}
		})
		return response.data;
	})
	return result;
}

const plan = await readCSV('planOutput.csv');

const output = new CSVLogger('executionOutput.csv');

for (let entry of plan){
	entry.emailAddress = entry.emailAddress.trim();
	try{
		if (entry.accountId === 'unableToAccess'){
			entry.status = 'unableToAccess';
			output.log(entry);
			continue;
		}
		if (entry.propertyId.match(/^UA.+/)){ //Universal Analytics
			await createGAPropertyUser(entry.accountId,entry.propertyId,entry.emailAddress,entry.propertyPermissions.split(','));
		} else { //GA4
			await createGA4PropertyUser(entry.accountId,entry.propertyId,entry.emailAddress,entry.propertyPermissions.split(','));
		}
		console.log(`SUCCESS -- Account: ${entry.accountId}, Property: ${entry.propertyId}, Email: ${entry.emailAddress}`);
		entry.status = 'success'
	} catch (e) {
		console.log(e);
		entry.status = 'failure';
	}
	output.log(entry);
}