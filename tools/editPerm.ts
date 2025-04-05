import { input } from '@inquirer/prompts'
import { appendPermission, PermissionFlags } from '../lib/permission'

const userId = await input({
    message: 'Please enter the user ID',
    required: true,
})
const permissionFlagsString = Object.keys(PermissionFlags);
const permissionStr = await input({
    message: `Please enter the permission to add (${permissionFlagsString.join(', ')})`,
    required: true,
    validate(value) {
        if (!value.split(',').every(v => permissionFlagsString.includes(v.trim()))) {
            return 'Invalid permission'
        }
        return true
    }
})
const permissions = permissionStr.split(',').map(v => PermissionFlags[v.trim() as keyof typeof PermissionFlags]);
if (await appendPermission(userId, permissions)) {
    console.log(`Permissions ${permissionStr} added for user ${userId}`)
} else {
    console.log(`Failed to add permission ${permissionStr} for user ${userId}`)
}