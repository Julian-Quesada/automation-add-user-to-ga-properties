import {readCSV, defaultGoogleAPIWrapper, CSVLogger} from 'api-schema-utils';
import { getGA4AccountSummaries } from './ga4Methods.js';
const propertyCSV = 'accountsAndProperties.csv';
import {readFileSync} from 'fs';
const permissions = {
	admin: 'COLLABORATE,READ_AND_ANALYZE,EDIT,MANAGE_USERS',
	editor: 'COLLABORATE,READ_AND_ANALYZE,EDIT',
	analyst: 'READ_AND_ANALYZE,COLLABORATE',
	viewer: 'READ_AND_ANALYZE'
}

const accountIdKey = 'accountId';

async function listWebpropertyUserLinks(accountId: string, webPropertyId: string){
	let accountMap = new Map();
	await defaultGoogleAPIWrapper.getCredentialPool();
	for (let i = 1; i <= defaultGoogleAPIWrapper.credentialPool.length; i++){
		console.log(`Credential ${i}`);
		try{
			let allResults: any[] = await defaultGoogleAPIWrapper.wrapPaginatedGAPICall({
				idempotent: true,
				resource: `getUserLinks${accountId}${webPropertyId}`,
				desc: 'Listing All Accounts',
				resultKey: 'items',
				credentialNum: i
			}, async (pageToken: any) => {
				if (pageToken) console.log(`Page ${pageToken}`);
				let response: any = await defaultGoogleAPIWrapper.google.analytics({version: 'v3'}).management.webpropertyUserLinks.list({
					accountId: accountId,
					webPropertyId: webPropertyId,
					'start-index': pageToken || 1
				});
				if (response.data.nextLink){
					response.data.nextPageToken = response.data.startIndex + 1;
				};
				return response.data;
			});
			for (let account of allResults){
				if (accountMap.has(account.id)) continue;
				accountMap.set(account.id,account);
			}
		} catch (e) {
			if (e?.response?.data?.['error_description']?.match(/token.+expired/gi)){
				continue;
			} else if (e?.message?.match(/no.+credential.+found/gi)){
				continue;
			} else {
				throw e;
			}
		}
		
	}
	return Array.from(accountMap.values());
}

async function getAccountSummaries(){
	let accountMap = new Map();
	await defaultGoogleAPIWrapper.getCredentialPool();
	for (let i = 1; i <= defaultGoogleAPIWrapper.credentialPool.length; i++){
		console.log(`Credential ${i}`);
		try{
			let allResults: any[] = await defaultGoogleAPIWrapper.wrapPaginatedGAPICall({
				idempotent: true,
				resource: 'listAccounts',
				desc: 'Listing All Accounts',
				resultKey: 'items',
				credentialNum: i
			}, async (pageToken: any) => {
				if (pageToken) console.log(`Page ${pageToken}`);
				let response: any = await defaultGoogleAPIWrapper.google.analytics({version: 'v3'}).management.accountSummaries.list({
					'start-index': pageToken || 1
				});
				if (response.data.nextLink){
					response.data.nextPageToken = response.data.startIndex + 1;
				};
				return response.data;
			});
			for (let account of allResults){
				if (accountMap.has(account.id)) continue;
				accountMap.set(account.id,account);
			}
		} catch (e) {
			if (e?.message?.match(/no.+credential.+found/gi)){
				continue;
			} else {
				throw e;
			}
		}
		
	}
	let ga4Summaries = await getGA4AccountSummaries();
	return Array.from(accountMap.values()).concat(ga4Summaries);
};


let accountsAndProperties;
const dirPath = process.argv.find(entry => entry.includes('dir=')).replace('--dir=','');
try {
	readFileSync(`${dirPath}/${propertyCSV}`);
	accountsAndProperties = await readCSV(propertyCSV);
} catch (e) {
	if (!e.message.match(/no such file/i)){
		throw e;
	}
}

const csv = await readCSV('input.csv');
const users = csv.filter(item => item.emailAddress);

console.log('Getting Account IDs');
if (accountsAndProperties === undefined && !(accountIdKey in csv[0])){
	const summaries = await getAccountSummaries();
	const allProperties = csv.map(row => row.gaProperty.toUpperCase().trim().replace(/[^a-zA-Z0-9\-]/,''));
	const filteredAccounts = [];
	for (let summary of summaries){
		for (let property of summary.webProperties){
			if (allProperties.includes(property.id)){
				filteredAccounts.push({
					accountId: summary.id,
					property: property.id
				});
			}
		}
	}
	const filteredCSV = new CSVLogger(propertyCSV);
	for (let account of filteredAccounts){
		filteredCSV.log(account);
	}
	accountsAndProperties = filteredAccounts;
}

console.log('Generating Plan');

const planOutput = new CSVLogger('planOutput.csv');
for (let row of csv){
	for (let user of users){
		row.gaProperty = row.gaProperty.toUpperCase().trim().replace(/[^a-zA-Z0-9\-]/,'');
		const account = accountsAndProperties?.find(item => item.property === row.gaProperty)?.accountId;
		let rowPermissions;
		if (row.gaProperty.match(/^UA.+/)){ //Universal Analytics
			rowPermissions = permissions[user.permissions];
		} else { //GA4
			rowPermissions = `predefinedRoles/${user.permissions}`;
		}
		let lineToLog = {
			emailAddress: user.emailAddress,
			accountId: account || row.accountId || 'unableToAccess',
			// accountPermissions: permissions[user.permissions],
			propertyId: row.gaProperty,
			propertyPermissions: rowPermissions
		}
		planOutput.log(lineToLog);
	}
}
console.log('Done');