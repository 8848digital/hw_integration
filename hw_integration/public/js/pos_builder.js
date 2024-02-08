frappe.POSInterfaceBuilder = class extends frappe.POSInterfaceBuilder {
	async prepare_app_defaults(data) {
		var me = this;
		await super.prepare_app_defaults(data);
		const profile = await hwi.qz.get_pos_hw_profile(me.terminal);
		if (!Object.keys(profile).length) return;
		hwi.qz
			.init_qz()
			.then(() => {
				hwi.qz.set_printer();
				hwi.qz.set_serial_comm(profile?.port).then(() => {
					hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2);
				});
			})
			.catch((err) => {
				console.log("Couldn't connect due to " + err);
			});
	}
	async update_values_to_indexeddb(timeout) {
		var me = this;
		const is_item_added = me.new_added_items.length > 0 ? true : false;
		const item_updated = me.item_updated;
		const deleted_row = me.deleted_row;
		await super.update_values_to_indexeddb(timeout);
		const obj = cur_frm.doc;
		let profile = await hwi.qz.hw_profile;
		let item_list = obj.items;
		var txn_line2;
		if (is_item_added) {
			if (profile?.port) {
				var txn_line1 = await frappe.render_template(profile.txn_line_1, {
					doc: obj,
					item: item_list[item_list.length - 1],
				});
				if (profile.txn_line_2) {
					txn_line2 = frappe.render_template(profile.txn_line_2, {
						doc: obj,
						item: item_list[item_list.length - 1],
					});
				}
				hwi.qz.send_comm_data(profile.port, txn_line1, txn_line2);
			}
		}
		if (item_updated == "qty") {
			if (profile?.port) {
				if (profile.txn_line_2) {
					txn_line2 = frappe.render_template(profile.txn_line_2, {
						doc: obj,
						item: item_list[item_list.length - 1],
					});
					hwi.qz.send_comm_data_for_line_2(profile.port, txn_line2);
				}
			}
		}
		if (deleted_row == "items") {
			if (item_list.length < 1) {
				hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2);
				return;
			}
			if (profile?.port) {
				if (profile.txn_line_2) {
					txn_line2 = frappe.render_template(profile.txn_line_2, {
						doc: obj,
						item: item_list[item_list.length - 1],
					});
					hwi.qz.send_comm_data_for_line_2(profile.port, txn_line2);
				}
			}
		}
	}
};
