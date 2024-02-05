frappe.POSInterfaceBuilder = class extends frappe.POSInterfaceBuilder {
    async prepare_app_defaults(data) {
        var me = this
        await super.prepare_app_defaults(data)
        const profile = await hwi.qz.get_pos_hw_profile(me.terminal)
        if (!Object.keys(profile).length) return
        hwi.qz.init_qz().then(()=> {
			hwi.qz.set_printer()
			hwi.qz.set_serial_comm(profile?.port).then(()=>{
				hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
			})
		}).catch((err)=>{
            console.log("Couldn't connect due to "+err)
        })
    }
	async update_values_to_indexeddb(timeout) {
		var me = this
		const is_item_added = me.new_added_items.length > 0 ? true:false
		await super.update_values_to_indexeddb(timeout)
		if (!is_item_added) return
		const obj = cur_frm.doc
		let item_list = cur_frm.doc.items
        var profile = await hwi.qz.hw_profile
        if (profile?.port) {
            var txn_line1 = await frappe.render_template(profile.txn_line_1, {doc: obj, item: item_list[item_list.length-1]})
            var txn_line2
            if (profile.txn_line_2) {
                txn_line2 = frappe.render_template(profile.txn_line_2, {"doc": obj, "item": item_list[item_list.length-1]})
            }
            hwi.qz.send_comm_data(profile.port, txn_line1, txn_line2)
        }
	}
}
