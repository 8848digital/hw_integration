frappe.ui.POSCommandsBuilder = class extends frappe.ui.POSCommandsBuilder{
    async insert_pos_invoice_items(item_list, pos_invoice, redirect_to_profile, user_defined_gc_number){
        var obj =(await super.insert_pos_invoice_items(item_list, pos_invoice, redirect_to_profile, user_defined_gc_number)).message
        var profile = await hwi.qz.hw_profile
        if (profile?.port) {
            var txn_line1 = await frappe.render_template(profile.txn_line_1, {doc: obj, item: item_list[item_list.length-1]})
            var txn_line2
            if (profile.txn_line_2) {
                console.log(frappe.pos_interface_builder.doc_obj["POS Invoice"])
                txn_line2 = frappe.render_template(profile.txn_line_2, {"doc": obj, "item": item_list[item_list.length-1]})
            }
            hwi.qz.send_comm_data(profile.port, txn_line1, txn_line2)
        }
    }
    async _complete_transaction(profile_id, pos_invoice_name){
		super._complete_transaction(profile_id, pos_invoice_name)
        var profile = hwi.qz.hw_profile
        if (profile?.port) {
            var txn_line1 = profile.txn_end_line_1
            var txn_line2 = profile.txn_end_line_2
            hwi.qz.send_comm_data(profile.port, txn_line1, txn_line2)
        }
	}
    print_receipt(pos_invoice_name, pos_print_format){
		var me = this;
        if (!pos_invoice_name || !pos_print_format) return
		if (hwi.raw_printer){
			me.get_raw_commands(pos_invoice_name, pos_print_format,function (out) {
                hwi.qz
                    .qz_connect()
                    .then(function () {
                        var printData ;
                        var profile = hwi.qz.hw_profile
                        var opts = {
                            language: profile.raw_lang_txn,
                            x: profile.txn_x,
                            y: profile.txn_y,
                            dotDensity: profile.txn_dot_density,
                            xmlTag: profile.txn_xml_tag,
                            pageWidth: profile.txn_render_width,
                            pageHeight: profile.txn_render_height
                        };
                        if (out.raw_printing){
                            printData = [out.print_data]
                        }
                        else {
                            console.log(opts)
                            switch(opts.language) {
                                case 'EPL':
                                    printData = [
                                        '\nN\n',
                                        'q812\n',
                                        'Q1218,26\n',
                                        { type: 'raw', format: 'html', flavor: 'plain', data: out.print_data, options: opts },
                                        '\nP1,1\n'
                                    ];
                                    break;
                                case 'ZPL':
                                    printData = [
                                        '^XA\n',
                                        { type: 'raw', format: 'html', flavor: 'plain', data: out.print_data, options: opts },
                                        '^XZ\n'
                                    ];
                                    break;
                                case 'ESCPOS':
                                    printData = [
                                        { type: 'raw', format: 'html', flavor: 'plain', data: out.print_data, options: opts },
                                        '\x0A' + '\x0A' + '\x0A', '\x1B' + '\x69'
                                    ];
                                    break;
                                default:
                                    frappe.throw("Cannot print HTML using this printer language");
                                    break;
                                }
                        }
                        let config = qz.configs.create(hwi.raw_printer);
                        return qz.print(config, printData);
                    })
                    .then(frappe.ui.form.qz_success)
                    .catch((err) => {
                        frappe.ui.form.qz_fail(err);
                    });
            })
		}
        else {
            frappe.utils.print(
				"POS Invoice",
				pos_invoice_name,
				pos_print_format,
				0,
				frappe.boot.lang
			);
        }
	}
    get_raw_commands(pos_invoice, pos_print_format,callback) {
		frappe.call({
			method: "hw_integration.utils.print.get_print_content",
			args: {
				pos_invoice: pos_invoice,
				print_format: pos_print_format
			},
			callback: function (r) {
				if (!r.exc) {
					callback(r.message);
				}
			},
		});
	}
    edit_pos_invoice_item_row(pos_invoice, dg_id, dg_pos_command, new_value){
        super.edit_pos_invoice_item_row(pos_invoice, dg_id, dg_pos_command, new_value).then((res)=>{
            var obj = res.message
            var profile = hwi.qz.hw_profile
            var item_list = obj.items
            if (profile?.port) {
                var txn_line2
                if (profile.txn_line_2) {
                    txn_line2 = frappe.render_template(profile.txn_line_2, {"doc": obj, "item": item_list[item_list.length-1]})
                    hwi.qz.send_comm_data_for_line_2(profile.port, txn_line2)
                }
            }
        })
	}
    remove_item(me, pos_invoice) {
        super.remove_item(me, pos_invoice)
        .then((res)=>{
            var obj = res.message
            var profile = hwi.qz.hw_profile
            var item_list = obj.items
            if (item_list.length < 1) {
                hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
                return
            }
            if (profile?.port) {
                var txn_line2
                if (profile.txn_line_2) {
                    txn_line2 = frappe.render_template(profile.txn_line_2, {"doc": obj, "item": item_list[item_list.length-1]})
                    hwi.qz.send_comm_data_for_line_2(profile.port, txn_line2)
                }
            }
        })
    }
    close_transaction(me, pos_invoice){
        super.close_transaction(me, pos_invoice)
        hwi.qz.get_pos_hw_profile(me.pos_profile).then((profile)=>{
            if (profile) {
                hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
            }
        })
    }
    get_weight_from_machine(){
        return hwi.get_weight()
    }
}

frappe.POSInterfaceBuilder = class extends frappe.POSInterfaceBuilder {
    async prepare_app_defaults(data) {
        var me = this
        await super.prepare_app_defaults(data)
        let profile = await hwi.qz.get_pos_hw_profile(me.pos_profile)
        if (!Object.keys(profile).length) return
        await hwi.qz.init_qz().catch((err)=>{
            console.log("Couldn't connect due to "+err)
        })
        await hwi.qz.set_serial_comm(profile?.port)
        await hwi.qz.set_printer()
        hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
    }
    // async load_interface_components(pos_invoice){
    //     var me = this
    //     super.load_interface_components(pos_invoice)
    //     console.log([me.interface_profile_doc.name, frappe.get_route()[1]])
    //     if (!pos_invoice && me.interface_profile_doc.name == frappe.get_route()[1]) {
    //         let profile = hwi.qz.hw_profile
    //         if (!profile) return
    //         console.log('print')
    //         hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
    //     }
	// }
    // async get_interface_profile(interface_profile, pos_invoice, negative_stock_item_data=null, alternate_product=null, batchwise_item=null, serial_item=null, variant_template=null){
    //     await super.get_interface_profile(interface_profile, pos_invoice, negative_stock_item_data, alternate_product, batchwise_item, serial_item, variant_template)
    //     if (!pos_invoice) {
    //         let profile = hwi.qz.hw_profile
    //         if (!profile) return
    //         hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
    //     }
	// }
}