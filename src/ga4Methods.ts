import {defaultGoogleAPIWrapper} from 'api-schema-utils';

export async function getGA4AccountSummaries(){
	let accountMap = new Map();
	await defaultGoogleAPIWrapper.getCredentialPool();
	for (let i = 1; i <= defaultGoogleAPIWrapper.credentialPool.length; i++){
		console.log(`Credential ${i}`);
		try{
			let allResults: any[] = await defaultGoogleAPIWrapper.wrapPaginatedGAPICall({
				idempotent: true,
				resource: 'listAccounts',
				desc: 'Listing All Accounts',
				resultKey: 'accountSummaries',
				credentialNum: i
			}, async (pageToken: any) => {
				let listBody: {[key:string]: any} = {};
				if (pageToken) console.log(`Page ${pageToken}`);
				if (pageToken){
					listBody.pageToken = pageToken;
				}
				let response: any = await defaultGoogleAPIWrapper.google.analyticsadmin({version:'v1alpha'}).accountSummaries.list(listBody);
				return response.data;
			});
			for (let account of allResults){
				if (!accountMap.has(account.account)){
					account.id = account.account.replace(/accounts\//,'');
					for (let property of account.propertySummaries || []){
						property.id = property.property.replace(/properties\//,'');
					}
					account.webProperties = account.propertySummaries || [];
					accountMap.set(account.account,account);
				}
				let curAccount = accountMap.get(account.account);
				if (!curAccount.propertyMap) curAccount.propertyMap = new Map();
				let propertyMap = curAccount.propertyMap;
				let properties = curAccount.propertySummaries || [];
				for (let property of properties){
					if (!propertyMap.has(property.property)) propertyMap.set(property.property,property);
				}
				curAccount.webProperties = Array.from(propertyMap.values());
			}
		} catch (e) {
			if (e?.message?.match(/no.+credential.+found/gi)){
				continue;
			} else {
				throw e;
			}
		}
		
	}
	return Array.from(accountMap.values());
};

export async function createGA4PropertyUser(accountId: string, propertyId: string, email: string, permissions: string[]){
	let result = await defaultGoogleAPIWrapper.wrapGAPICall({
		idempotent: false, //creating the same user twice just results in an update to the user's permissions
		resource: `createAccountUserLink_${accountId}`,
		desc: `Creating User for account ${accountId}`
	}, async () => {
		let response = await defaultGoogleAPIWrapper.google.analyticsadmin({version: 'v1alpha'}).properties.userLinks.create({
			parent: `properties/${propertyId}`,
			requestBody:{
				emailAddress: email,
				directRoles: permissions
			}
		})
		return response.data;
	})
	return result;
}